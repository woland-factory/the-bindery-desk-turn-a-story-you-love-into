import type { Document } from "../model/document";
import type { DesignSpec, Page, PaginationResult } from "./types";
import type { Measurer } from "./measurer";
import { createHyphenator } from "./hyphenate";
import {
  chapterFlow,
  computeMetrics,
  maybeInsertRectoBlank,
  orderedChapters,
  packChapter,
  type LayoutMetrics,
} from "./paginate";

// Streaming orchestration. `runEngine` is the single pagination pass: it walks
// chapters in order, emits an early first-feedback event (a cheap estimate
// plus the first real pages), yields a checkpoint after every chapter so the
// worker can honor latest-wins cancellation, and ends with the settled exact
// result. It is pure over (Document, DesignSpec, Measurer): the same inputs
// always produce the same events.

/** Pages carried in the first-feedback message, enough to fill the preview. */
export const FIRST_PAGES = 4;

export interface ProgressEvent {
  type: "progress";
  estimatedPageCount: number;
  firstPages: Page[];
}
export interface TickEvent {
  type: "tick";
}
export interface DoneEvent {
  type: "done";
  result: PaginationResult;
  wordCount: number;
}
export type EngineEvent = ProgressEvent | TickEvent | DoneEvent;

/**
 * A cheap page-count estimate from total character count over an estimated
 * chars-per-page. Used only for the sub-100ms first feedback, never for
 * layout.
 */
function estimatePageCount(chars: number, metrics: LayoutMetrics): number {
  const avgCharPx = metrics.bodyStyle.sizePx * 0.5;
  const charsPerLine = Math.max(1, Math.floor(metrics.columnPx / avgCharPx));
  const charsPerPage = Math.max(1, metrics.bodyLinesPerPage * charsPerLine);
  return Math.max(1, Math.ceil(chars / charsPerPage));
}

export function* runEngine(
  doc: Document,
  design: DesignSpec,
  measurer: Measurer,
): Generator<EngineEvent> {
  const metrics = computeMetrics(design);
  const hyphenator = createHyphenator(doc.language || "en");
  const chapters = orderedChapters(doc);

  // A single cheap pass over kept text to seed the page-count estimate.
  let totalChars = 0;
  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      if (block.keptOrDropped === "kept" && block.text) totalChars += block.text.length;
    }
  }
  const estimatedPageCount = estimatePageCount(totalChars, metrics);

  const pages: Page[] = [];
  let wordCount = 0;
  let emittedFirst = false;

  for (const chapter of chapters) {
    const flow = chapterFlow(chapter, metrics, measurer, hyphenator, design.hyphenation);
    wordCount += flow.wordCount;
    if (flow.lines.length > 0) {
      maybeInsertRectoBlank(design, pages);
      packChapter(chapter.order, flow.lines, metrics, design.widowControl, pages);
    }

    if (!emittedFirst && pages.length > 0) {
      yield { type: "progress", estimatedPageCount, firstPages: pages.slice(0, FIRST_PAGES) };
      emittedFirst = true;
    } else {
      yield { type: "tick" };
    }
  }

  if (!emittedFirst) {
    // No chapter produced pages (e.g. an all-boilerplate book).
    yield { type: "progress", estimatedPageCount, firstPages: pages.slice(0, FIRST_PAGES) };
  }

  yield { type: "done", result: { pageCount: pages.length, pages }, wordCount };
}

/**
 * Transport the worker (and tests) drive the engine through. Keeps the
 * generator free of postMessage, timing, and cancellation so both can be
 * tested against a fake.
 */
export interface EngineTransport {
  /** True once this request has been superseded by a newer one. */
  isStale(): boolean;
  postProgress(estimatedPageCount: number, firstPages: Page[]): void;
  postDone(result: PaginationResult, wordCount: number): void;
  /** Yield to the event loop so queued messages (a newer request) are seen. */
  yieldToLoop(): Promise<void>;
  now(): number;
}

/** Work between event-loop yields, in ms. Bounds cancellation latency. */
const SLICE_MS = 12;

/**
 * Drive a `runEngine` generator through a transport: forward progress and
 * done, yield to the loop every SLICE_MS so a newer request can supersede
 * this one, and abandon a stale pass promptly.
 */
export async function driveEngine(
  gen: Generator<EngineEvent>,
  transport: EngineTransport,
): Promise<void> {
  let lastYield = transport.now();
  for (const ev of gen) {
    if (transport.isStale()) return;
    if (ev.type === "progress") {
      transport.postProgress(ev.estimatedPageCount, ev.firstPages);
    } else if (ev.type === "done") {
      transport.postDone(ev.result, ev.wordCount);
      return;
    }
    if (transport.now() - lastYield > SLICE_MS) {
      await transport.yieldToLoop();
      if (transport.isStale()) return;
      lastYield = transport.now();
    }
  }
}
