import type { Chapter, Document } from "../model/document";
import type { DesignSpec, Line, Page, PaginationResult } from "./types";
import type { Measurer, TextStyle } from "./measurer";
import { lengthToPx, ptToPx, roundPx } from "./units";
import { breakParagraph, type BrokenLine } from "./lineBreak";
import type { Hyphenator } from "./hyphenate";
import { runEngine } from "./engine";

// Page assembly: paragraphs -> pages, with per-page line capacity, opener top
// drop, recto-opening with blank-verso insertion, widow/orphan control, and
// an exact page count. Pure and deterministic. The full streaming pass lives
// in engine.ts and reuses these helpers, so the streamed result and the
// pure result are produced by exactly one code path.

/** Derived, constant-per-design layout geometry, all in CSS px. */
export interface LayoutMetrics {
  columnPx: number;
  lineHeightPx: number;
  bodyLinesPerPage: number;
  openerLinesPerPage: number;
  openerTopDropPx: number;
  bodyStyle: TextStyle;
  headingStyle: TextStyle;
}

export function computeMetrics(design: DesignSpec): LayoutMetrics {
  const { trim, margins, font, chapterOpening } = design;
  const columnPx = roundPx(lengthToPx(trim.w - margins.inner - margins.outer, trim.unit));
  const textAreaPx = lengthToPx(trim.h - margins.top - margins.bottom, trim.unit);
  const lineHeightPx = ptToPx(font.lineHeightPt);
  const openerTopDropPx = ptToPx(chapterOpening.topDropPt);
  const bodyLinesPerPage = Math.max(1, Math.floor(textAreaPx / lineHeightPx));
  const openerLinesPerPage = Math.max(
    1,
    Math.floor((textAreaPx - openerTopDropPx) / lineHeightPx),
  );
  const sizePx = ptToPx(font.sizePt);
  return {
    columnPx,
    lineHeightPx,
    bodyLinesPerPage,
    openerLinesPerPage,
    openerTopDropPx,
    bodyStyle: { family: font.family, sizePx, bold: font.bold },
    headingStyle: { family: font.family, sizePx, bold: true },
  };
}

/** recto = even 0-based index (folio 1, 3, 5...); verso = odd. */
export function sideForIndex(index: number): "recto" | "verso" {
  return index % 2 === 0 ? "recto" : "verso";
}

interface FlowLine {
  line: BrokenLine;
  paraLen: number;
  idxInPara: number;
}

export interface ChapterFlow {
  lines: FlowLine[];
  wordCount: number;
}

/** Break one chapter's kept flowable blocks into a flat, metadata-tagged line list. */
export function chapterFlow(
  chapter: Chapter,
  metrics: LayoutMetrics,
  measurer: Measurer,
  hyphenator: Hyphenator,
  hyphenation: boolean,
): ChapterFlow {
  const lines: FlowLine[] = [];
  let wordCount = 0;
  for (const block of chapter.blocks) {
    if (block.keptOrDropped !== "kept") continue;
    if (block.type !== "heading" && block.type !== "paragraph" && block.type !== "note") continue;
    const text = block.text ?? "";
    if (!text) continue;
    wordCount += countWords(text);
    const style = block.type === "heading" ? metrics.headingStyle : metrics.bodyStyle;
    const broken = breakParagraph(text, {
      columnPx: metrics.columnPx,
      style,
      measurer,
      hyphenator,
      hyphenation,
    });
    for (let i = 0; i < broken.length; i++) {
      lines.push({ line: broken[i], paraLen: broken.length, idxInPara: i });
    }
  }
  return { lines, wordCount };
}

function countWords(text: string): number {
  let n = 0;
  let inWord = false;
  for (const ch of text) {
    const space = ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
    if (!space && !inWord) {
      n++;
      inWord = true;
    } else if (space) {
      inWord = false;
    }
  }
  return n;
}

/**
 * How many lines from `cursor` go on the current page. Plain greedy fill,
 * then widow/orphan adjustment when enabled. Always returns at least 1 so the
 * cursor advances; bounded, so it always terminates.
 */
function decideTake(
  flow: FlowLine[],
  cursor: number,
  capacity: number,
  widowControl: boolean,
): number {
  const greedy = Math.min(capacity, flow.length - cursor);
  if (!widowControl || capacity < 2) return greedy;

  let take = greedy;
  // Each pass can only shrink `take`, so this loop is bounded by `capacity`.
  for (let guard = 0; guard <= capacity; guard++) {
    if (take < 2) return greedy; // cannot honor a two-line minimum; take greedy
    const hasMore = cursor + take < flow.length;
    if (!hasMore) return take; // nothing carries over, nothing to strand

    const last = flow[cursor + take - 1];
    const next = flow[cursor + take];
    // Orphan: a paragraph's lone first line left at the foot of this page.
    const orphan = last.idxInPara === 0 && last.paraLen >= 2;
    // Widow: a paragraph's lone last line would start the next page.
    const widow = next.idxInPara === next.paraLen - 1 && next.paraLen >= 2;
    if (orphan || widow) {
      take -= 1;
      continue;
    }
    return take;
  }
  return greedy;
}

/** Lay a chapter's flow onto pages, appending to `pages`. */
export function packChapter(
  chapterOrder: number,
  flow: FlowLine[],
  metrics: LayoutMetrics,
  widowControl: boolean,
  pages: Page[],
): void {
  let cursor = 0;
  let firstPage = true;
  while (cursor < flow.length) {
    const capacity = firstPage ? metrics.openerLinesPerPage : metrics.bodyLinesPerPage;
    const topDrop = firstPage ? metrics.openerTopDropPx : 0;
    const take = decideTake(flow, cursor, capacity, widowControl);

    const lines: Line[] = [];
    for (let i = 0; i < take; i++) {
      const { line } = flow[cursor + i];
      lines.push({
        text: line.text,
        x: 0,
        y: roundPx(topDrop + i * metrics.lineHeightPx),
        width: line.width,
        hyphenated: line.hyphenated,
      });
    }

    const index = pages.length;
    pages.push({
      index,
      side: sideForIndex(index),
      kind: firstPage ? "opener" : "body",
      chapterIndex: chapterOrder,
      lines,
    });
    cursor += take;
    firstPage = false;
  }
}

/** Insert a blank verso before an opener that would otherwise land on a verso. */
export function maybeInsertRectoBlank(design: DesignSpec, pages: Page[]): void {
  if (!design.chapterOpening.startRecto) return;
  const nextIndex = pages.length;
  if (sideForIndex(nextIndex) === "verso") {
    pages.push({ index: nextIndex, side: "verso", kind: "blank", chapterIndex: -1, lines: [] });
  }
}

/** Iterate chapters in reading order (by `order`), stably. */
export function orderedChapters(doc: Document): Chapter[] {
  return doc.chapters.slice().sort((a, b) => a.order - b.order);
}

/**
 * Full pagination pass. Pure: identical inputs yield a byte-identical result.
 * Drains the streaming engine (one code path) and returns the settled result.
 */
export function paginate(
  doc: Document,
  design: DesignSpec,
  measurer: Measurer,
): PaginationResult {
  let result: PaginationResult | null = null;
  for (const ev of runEngine(doc, design, measurer)) {
    if (ev.type === "done") result = ev.result;
  }
  // runEngine always yields a terminal `done`.
  return result as PaginationResult;
}
