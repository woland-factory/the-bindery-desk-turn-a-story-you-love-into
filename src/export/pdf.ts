import { PDFDocument, degrees, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DesignSpec, Page, PaginationResult } from "../engine/types";
import { resolveRunningHead } from "../ui/runningHead";
import { pagePointBox, pxToPt, lineBaselinePt } from "./geometry";
import { displayLineText } from "./lineText";
import type { ImpositionPlan, PlacedPage } from "./impose";
import type { DocMeta } from "./protocol";

// The PDF builders. Both run inside the export worker. buildTypeset emits one
// PDF page per Page, placed from exactly the preview's geometry with the book's
// face embedded (subset). buildSignatures embeds those typeset pages once as
// shared XObjects and arranges two per printed sheet side per the imposition
// plan. Neither redraws text into the signature file, so peak memory stays near
// one typeset document. Deterministic: no clocks, no randomness.

/** The preview draws chrome (head + folio) at a fixed 10px in a 16px box. */
const CHROME_FONT_PX = 10;
const CHROME_BOX_PX = 16;

/** Report progress at most every this many pages/sides. */
const PROGRESS_EVERY = 50;

export type ProgressFn = (done: number, total: number) => void;

/**
 * Build the typeset PDF: one page per `result.pages` entry, at the trim size
 * for its side, reproducing the preview. Returns the PDFDocument so the worker
 * can both save its bytes and hand it to buildSignatures without re-embedding.
 */
export async function buildTypeset(
  result: PaginationResult,
  design: DesignSpec,
  docMeta: DocMeta,
  fontBytes: Uint8Array,
  onProgress?: ProgressFn,
): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const ascentRatio = ascentRatioOf(fontBytes);

  const total = result.pages.length;
  for (let i = 0; i < total; i++) {
    const page = result.pages[i];
    const box = pagePointBox(design, page.side);
    const pdfPage = doc.addPage([box.pageWidthPt, box.pageHeightPt]);

    // Body text and chapter openings both carry their lines in `page.lines`;
    // the engine has already baked any opener top drop into each `line.y`.
    let drew = false;
    for (const line of page.lines) {
      const text = displayLineText(line);
      if (!text) continue;
      const fromTop = lineBaselinePt(box.placement, line, ascentRatio);
      pdfPage.drawText(text, {
        x: box.textLeftPt + pxToPt(line.x),
        y: box.pageHeightPt - fromTop,
        size: box.fontSizePt,
        font,
      });
      drew = true;
    }

    // Chrome (running head + folio) only on body pages, matching PageView.
    if (page.kind === "body") {
      drawChrome(pdfPage, page, design, docMeta, box, font, ascentRatio);
      drew = true;
    }

    // A page that drew nothing (a blank leaf) still needs a content stream, or
    // embedPages in buildSignatures rejects it ("missing Contents"). A zero-size
    // rectangle emits an empty stream and paints nothing.
    if (!drew) {
      pdfPage.drawRectangle({ x: 0, y: 0, width: 0, height: 0 });
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === total) onProgress?.(i + 1, total);
  }
  if (total === 0) onProgress?.(0, 0);

  return doc;
}

function drawChrome(
  pdfPage: ReturnType<PDFDocument["addPage"]>,
  page: Page,
  design: DesignSpec,
  docMeta: DocMeta,
  box: ReturnType<typeof pagePointBox>,
  font: PDFFont,
  ascentRatio: number,
): void {
  const chromeSizePt = pxToPt(CHROME_FONT_PX);
  // The chrome box top sits at chromeTopPt; text is centered in a 16px box.
  const baselineFromTopPx =
    box.placement.chromeBaselinePx + (CHROME_BOX_PX - CHROME_FONT_PX) / 2 + CHROME_FONT_PX * ascentRatio;
  const baselineY = box.pageHeightPt - pxToPt(baselineFromTopPx);

  const template = page.side === "verso" ? design.runningHeader.verso : design.runningHeader.recto;
  const chapter = docMeta.chapterTitles[page.chapterIndex] ?? "";
  const head = resolveRunningHead(template, {
    title: docMeta.title,
    author: docMeta.author,
    chapter,
  });
  if (head) {
    const headWidth = font.widthOfTextAtSize(head, chromeSizePt);
    pdfPage.drawText(head, {
      x: box.textLeftPt + (box.columnPt - headWidth) / 2,
      y: baselineY,
      size: chromeSizePt,
      font,
    });
  }

  const folio = String(page.index + 1);
  const folioWidth = font.widthOfTextAtSize(folio, chromeSizePt);
  const folioX =
    box.folioEdge === "left" ? box.textLeftPt : box.textLeftPt + box.columnPt - folioWidth;
  pdfPage.drawText(folio, { x: folioX, y: baselineY, size: chromeSizePt, font });
}

/**
 * Build the signature PDF: one page per printed sheet side at the folded-sheet
 * size (two trim pages wide by one tall), placing the two typeset pages the
 * plan assigns, with each page's rotation. Padding sources (past the real page
 * count) and nulls draw nothing.
 */
export async function buildSignatures(
  typesetDoc: PDFDocument,
  plan: ImpositionPlan,
  design: DesignSpec,
  onProgress?: ProgressFn,
): Promise<PDFDocument> {
  const sigDoc = await PDFDocument.create();
  const trim = pagePointBox(design, "recto");
  const trimW = trim.pageWidthPt;
  const trimH = trim.pageHeightPt;

  // Embed every typeset page once; drawing references the shared XObject.
  const pageCount = typesetDoc.getPageCount();
  const embedded = await sigDoc.embedPages(typesetDoc.getPages());

  const total = plan.sides.length;
  for (let i = 0; i < total; i++) {
    const side = plan.sides[i];
    const sheet = sigDoc.addPage([trimW * 2, trimH]);
    placeHalf(sheet, side.left, 0, trimW, trimH, embedded, pageCount);
    placeHalf(sheet, side.right, trimW, trimW, trimH, embedded, pageCount);
    if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === total) onProgress?.(i + 1, total);
  }
  if (total === 0) onProgress?.(0, 0);

  return sigDoc;
}

function placeHalf(
  sheet: ReturnType<PDFDocument["addPage"]>,
  placed: PlacedPage,
  xOffset: number,
  trimW: number,
  trimH: number,
  embedded: Awaited<ReturnType<PDFDocument["embedPages"]>>,
  pageCount: number,
): void {
  const source = placed.source;
  if (source == null || source < 1 || source > pageCount) return; // blank / padding
  const emb = embedded[source - 1];
  if (placed.rotation === 180) {
    // Rotating 180 about (x, y) sweeps content into [x-w, x] x [y-h, y], so
    // anchor at the far corner to land it back in this half upright-flipped.
    sheet.drawPage(emb, {
      x: xOffset + trimW,
      y: trimH,
      width: trimW,
      height: trimH,
      rotate: degrees(180),
    });
  } else {
    sheet.drawPage(emb, { x: xOffset, y: 0, width: trimW, height: trimH });
  }
}

/** The embedded face's ascent as a fraction of its em, for baseline placement. */
function ascentRatioOf(fontBytes: Uint8Array): number {
  const fk = fontkit.create(fontBytes) as unknown as { ascent: number; unitsPerEm: number };
  if (fk.unitsPerEm > 0 && Number.isFinite(fk.ascent)) return fk.ascent / fk.unitsPerEm;
  return 0.8; // a sane serif default if metrics are unreadable
}
