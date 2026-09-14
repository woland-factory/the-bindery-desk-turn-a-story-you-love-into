import type { DesignSpec, PageSide } from "../engine/types";
import { computeMetrics } from "../engine/paginate";
import { lengthToPx, ptToPx } from "../engine/units";

// Pure page geometry. The engine gives each Line an x/y relative to the page's
// text area (the rectangle inside the margins). This module places that text
// area on the physical page per side, so verso and recto mirror across the
// gutter. All lengths are CSS px on the engine's basis (units.ts), so the
// renderer's pixel grid matches the engine's exactly.

export interface PagePlacement {
  /** Physical page box. */
  pageWidthPx: number;
  pageHeightPx: number;
  /** Left offset of the text area: verso = outer margin, recto = inner margin. */
  textLeftPx: number;
  /** Top offset of the text area (top margin). */
  textTopPx: number;
  /** Text column width (constant per design). */
  columnPx: number;
  /** Text area height (trim height minus top and bottom margins). */
  textHeightPx: number;
  lineHeightPx: number;
  fontSizePx: number;
  /** Headings share the body size in this EPIC; kept distinct for clarity. */
  headingSizePx: number;
  /** Baseline of the header/folio line, inside the top margin above the text. */
  chromeBaselinePx: number;
  /** Outer edge the folio sits against: verso -> left, recto -> right. */
  folioEdge: "left" | "right";
}

export function pagePlacement(design: DesignSpec, side: PageSide): PagePlacement {
  const { trim, margins, font } = design;
  const metrics = computeMetrics(design);

  const innerPx = lengthToPx(margins.inner, trim.unit);
  const outerPx = lengthToPx(margins.outer, trim.unit);
  const textTopPx = lengthToPx(margins.top, trim.unit);

  return {
    pageWidthPx: lengthToPx(trim.w, trim.unit),
    pageHeightPx: lengthToPx(trim.h, trim.unit),
    textLeftPx: side === "verso" ? outerPx : innerPx,
    textTopPx,
    columnPx: metrics.columnPx,
    textHeightPx: lengthToPx(trim.h - margins.top - margins.bottom, trim.unit),
    lineHeightPx: metrics.lineHeightPx,
    fontSizePx: ptToPx(font.sizePt),
    headingSizePx: ptToPx(font.sizePt),
    // The chrome line sits a little above the text, inside the top margin, so
    // the running head never collides with body text.
    chromeBaselinePx: textTopPx * 0.55,
    folioEdge: side === "verso" ? "left" : "right",
  };
}
