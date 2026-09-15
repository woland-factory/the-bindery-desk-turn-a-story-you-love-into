import type { DesignSpec, PaginationResult } from "./types";
import { computeMetrics } from "./paginate";
import {
  clampMargins,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_SPACING_MAX,
  LINE_SPACING_MIN,
  LINE_SPACING_STEP,
} from "../ui/design/designPatch";

// Pure paper-budget math, shared by the main thread and the worker (no DOM).
// Sheet arithmetic, the solver's user bounds, the density ladder the solver
// searches, and the page-count predictor that narrows that search. Everything
// here is deterministic: same inputs, same outputs, no clocks, no randomness.

/** One sheet folded once holds 4 book pages (the community's folio standard). */
export const PAGES_PER_SHEET = 4;
/** Signatures are counted at 4 sheets each (16 pages) for the readout. */
export const SHEETS_PER_SIGNATURE = 4;

/** Sheets needed for a page count. Even a 0/1-page book needs one sheet. */
export function sheetsForPages(pageCount: number): number {
  return Math.max(1, Math.ceil(pageCount / PAGES_PER_SHEET));
}

/** Signatures needed for a sheet count, at SHEETS_PER_SIGNATURE sheets each. */
export function signaturesForSheets(sheets: number): number {
  return Math.max(1, Math.ceil(sheets / SHEETS_PER_SIGNATURE));
}

/**
 * The user's rails for the solver's three levers. The solver never emits a
 * design outside these, and never violates the engine's hard floors.
 */
export interface BudgetBounds {
  fontMinPt: number;
  fontMaxPt: number;
  spacingMin: number;
  spacingMax: number;
  /** Percent of the base design's own margins. */
  marginsMinPct: number;
  marginsMaxPct: number;
}

export const DEFAULT_BOUNDS: BudgetBounds = {
  fontMinPt: 9,
  fontMaxPt: 13,
  spacingMin: 1.15,
  spacingMax: 1.6,
  marginsMinPct: 75,
  marginsMaxPct: 125,
};

/** Hard rails for the margin scale, in percent of the base margins. */
export const MARGIN_SCALE_MIN_PCT = 50;
export const MARGIN_SCALE_MAX_PCT = 150;
export const MARGIN_SCALE_STEP_PCT = 1;

function railClamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Snap to a step grid without float noise (steps are 0.5, 0.05, or 1). */
function snapStep(value: number, step: number): number {
  const inv = Math.round(1 / step);
  return Math.round(value * inv) / inv;
}

/**
 * Clamp bounds to their hard rails, snap each to its dial step (so every
 * ladder candidate can sit on the dial lattice), and resolve a crossed pair
 * deterministically by raising the max to the min.
 */
export function clampBounds(raw: BudgetBounds): BudgetBounds {
  const fontMinPt = snapStep(railClamp(raw.fontMinPt, FONT_SIZE_MIN, FONT_SIZE_MAX), FONT_SIZE_STEP);
  const fontMaxPt = Math.max(
    fontMinPt,
    snapStep(railClamp(raw.fontMaxPt, FONT_SIZE_MIN, FONT_SIZE_MAX), FONT_SIZE_STEP),
  );
  const spacingMin = snapStep(
    railClamp(raw.spacingMin, LINE_SPACING_MIN, LINE_SPACING_MAX),
    LINE_SPACING_STEP,
  );
  const spacingMax = Math.max(
    spacingMin,
    snapStep(railClamp(raw.spacingMax, LINE_SPACING_MIN, LINE_SPACING_MAX), LINE_SPACING_STEP),
  );
  const marginsMinPct = snapStep(
    railClamp(raw.marginsMinPct, MARGIN_SCALE_MIN_PCT, MARGIN_SCALE_MAX_PCT),
    MARGIN_SCALE_STEP_PCT,
  );
  const marginsMaxPct = Math.max(
    marginsMinPct,
    snapStep(railClamp(raw.marginsMaxPct, MARGIN_SCALE_MIN_PCT, MARGIN_SCALE_MAX_PCT), MARGIN_SCALE_STEP_PCT),
  );
  return { fontMinPt, fontMaxPt, spacingMin, spacingMax, marginsMinPct, marginsMaxPct };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ladder sampling resolution; fine enough that dedup, not sampling, bounds the list. */
const LADDER_STEPS = 128;

/**
 * The density ladder: t in [0, 1] moves font size, line spacing, and a margin
 * scale together from their densest (t=0, fewest sheets) to roomiest (t=1)
 * bounds, snapped to the dial lattice and the engine's margin floors, then
 * deduplicated. Every non-lever field is carried verbatim from `base`. Pure:
 * same base and bounds, same list.
 */
export function ladderCandidates(base: DesignSpec, bounds: BudgetBounds): DesignSpec[] {
  const b = clampBounds(bounds);
  const out: DesignSpec[] = [];
  const seen = new Set<string>();
  for (let k = 0; k <= LADDER_STEPS; k++) {
    const t = k / LADDER_STEPS;
    const sizePt = snapStep(lerp(b.fontMinPt, b.fontMaxPt, t), FONT_SIZE_STEP);
    const multiple = snapStep(lerp(b.spacingMin, b.spacingMax, t), LINE_SPACING_STEP);
    const lineHeightPt = Math.round(sizePt * multiple * 10) / 10;
    const scale = lerp(b.marginsMinPct, b.marginsMaxPct, t) / 100;
    const margins = clampMargins(base.trim, {
      inner: base.margins.inner * scale,
      outer: base.margins.outer * scale,
      top: base.margins.top * scale,
      bottom: base.margins.bottom * scale,
    });
    const key = [sizePt, lineHeightPt, margins.inner, margins.outer, margins.top, margins.bottom].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...base,
      font: { ...base.font, sizePt, lineHeightPt },
      margins,
    });
  }
  return out;
}

/** Lightweight stats of a completed pass, tallied from its assembled pages. */
export interface PassStats {
  totalLines: number;
  openerPages: number;
  blankPages: number;
}

/** Tally a result's PassStats. One cheap walk over the assembled pages. */
export function statsForResult(result: PaginationResult): PassStats {
  let totalLines = 0;
  let openerPages = 0;
  let blankPages = 0;
  for (const page of result.pages) {
    totalLines += page.lines.length;
    if (page.kind === "opener") openerPages++;
    else if (page.kind === "blank") blankPages++;
  }
  return { totalLines, openerPages, blankPages };
}

/** A settled pass the predictor anchors to. */
export interface PassRef {
  design: DesignSpec;
  pageCount: number;
  stats: PassStats;
}

/**
 * Estimate a candidate's page count from a settled reference pass. Advance
 * widths scale close to linearly with font size within one family, so line
 * count scales by (size ratio) x (inverse column ratio); the reference's
 * opener capacity loss, blank versos, and per-chapter remainders are treated
 * as design-independent overhead. A search accelerator only: exact counts
 * decide everything the user sees.
 */
export function predictPages(ref: PassRef, candidate: DesignSpec): number {
  const refMetrics = computeMetrics(ref.design);
  const candMetrics = computeMetrics(candidate);
  const candLines =
    ref.stats.totalLines *
    (candidate.font.sizePt / ref.design.font.sizePt) *
    (refMetrics.columnPx / candMetrics.columnPx);
  const overhead = ref.pageCount - Math.ceil(ref.stats.totalLines / refMetrics.bodyLinesPerPage);
  return Math.max(1, Math.ceil(candLines / candMetrics.bodyLinesPerPage) + overhead);
}

/** How a solve landed relative to its target. */
export type SolveAchieved = "hit" | "closest" | "clamped-dense" | "clamped-roomy";

/** The solver's report, carried on a solve's done message. */
export interface SolveOutcome {
  targetSheets: number;
  /** Exact: sheetsForPages of the applied design's real page count. */
  sheets: number;
  /** The applied (winner) design; always on the dial lattice, inside bounds. */
  design: DesignSpec;
  achieved: SolveAchieved;
  /** Exact engine counts this solve ran, for tests and telemetry. */
  passes: number;
}
