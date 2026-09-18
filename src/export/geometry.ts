import type { DesignSpec, Line, PageSide } from "../engine/types";
import { PX_PER_PT } from "../engine/units";
import { pagePlacement, type PagePlacement } from "../ui/pageGeometry";

// Pure px -> pt geometry for the typeset PDF. The preview lays every page out in
// CSS px through `pagePlacement`; the PDF is built by dividing those same
// numbers by PX_PER_PT, so the file matches the preview by construction rather
// than by a parallel layout pass. PDF's origin is the page's bottom-left, so a
// top-referenced offset flips to `pageHeightPt - offset` at draw time.

/** CSS px to PDF points (72 pt per inch, 96 px per inch). */
export function pxToPt(px: number): number {
  return px / PX_PER_PT;
}

/** A page's box and text placement in PDF points, plus the source px placement. */
export interface PagePointBox {
  pageWidthPt: number;
  pageHeightPt: number;
  textLeftPt: number;
  textTopPt: number;
  columnPt: number;
  textHeightPt: number;
  lineHeightPt: number;
  fontSizePt: number;
  /** Top of the running-head/folio line, measured from the page top, in pt. */
  chromeTopPt: number;
  folioEdge: "left" | "right";
  /** The underlying CSS-px placement, used for per-line baselines. */
  placement: PagePlacement;
}

export function pagePointBox(design: DesignSpec, side: PageSide): PagePointBox {
  const p = pagePlacement(design, side);
  return {
    pageWidthPt: pxToPt(p.pageWidthPx),
    pageHeightPt: pxToPt(p.pageHeightPx),
    textLeftPt: pxToPt(p.textLeftPx),
    textTopPt: pxToPt(p.textTopPx),
    columnPt: pxToPt(p.columnPx),
    textHeightPt: pxToPt(p.textHeightPx),
    lineHeightPt: pxToPt(p.lineHeightPx),
    fontSizePt: pxToPt(p.fontSizePx),
    chromeTopPt: pxToPt(p.chromeBaselinePx),
    folioEdge: p.folioEdge,
    placement: p,
  };
}

/**
 * Baseline of a body line, in pt measured from the page top. Models the CSS
 * line box the preview renders: a box of height `lineHeightPx` whose top sits at
 * `textTopPx + line.y`, with the glyphs vertically centered by line-height. The
 * baseline is half the leading plus the face's ascent below the box top;
 * `ascentRatio` is the embedded face's ascent as a fraction of its em
 * (fontkit `ascent / unitsPerEm`). The caller flips this to PDF's bottom origin.
 */
export function lineBaselinePt(p: PagePlacement, line: Line, ascentRatio: number): number {
  const halfLeadingPx = (p.lineHeightPx - p.fontSizePx) / 2;
  const baselineFromTopPx = p.textTopPx + line.y + halfLeadingPx + p.fontSizePx * ascentRatio;
  return pxToPt(baselineFromTopPx);
}
