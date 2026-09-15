import type { DesignSpec } from "../../engine/types";
import { convertLength, roundForUnit, type Trim, type Unit } from "./trimPresets";

// Pure setters over a DesignSpec. Each returns a NEW design, clamps its input
// to the bounds below (input validation at the control boundary), and re-derives
// dependent fields so the engine can always lay the result out: the column
// keeps a positive width and every page keeps at least one line.

// --- Bounds (mirrored by persistDesign's forward-merge) ---
export const FONT_SIZE_MIN = 7;
export const FONT_SIZE_MAX = 18;
export const FONT_SIZE_STEP = 0.5;

export const LINE_SPACING_MIN = 1.0;
export const LINE_SPACING_MAX = 2.5;
export const LINE_SPACING_STEP = 0.05;

/** Named chapter-opening top drops, in points. */
export const CHAPTER_DROPS = [0, 36, 72] as const;

/** Smallest physical trim dimension we accept, per unit. */
const TRIM_MIN: Record<Unit, number> = { in: 3, mm: 76 };
/** Smallest single margin, per unit (~0.15 in). */
const MARGIN_MIN: Record<Unit, number> = { in: 0.15, mm: 4 };
/** Space the text column and text height must keep, per unit. */
const MIN_COLUMN: Record<Unit, number> = { in: 0.75, mm: 20 };
const MIN_TEXT: Record<Unit, number> = { in: 0.5, mm: 12 };

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** The spacing multiple a design currently encodes. */
export function lineSpacingMultiple(design: DesignSpec): number {
  const m = design.font.lineHeightPt / design.font.sizePt;
  return Number.isFinite(m) && m > 0 ? m : 1;
}

function withLeading(font: DesignSpec["font"], sizePt: number, multiple: number): DesignSpec["font"] {
  const lineHeightPt = Math.round(sizePt * multiple * 10) / 10; // round to 0.1pt
  return { ...font, sizePt, lineHeightPt };
}

/**
 * Clamp all four margins so the pair sums leave a positive column and text
 * height. Runs after any trim or margin change. Order is inner→outer,
 * top→bottom, so the first of each pair keeps priority when space is tight.
 */
export function clampMargins(trim: Trim, margins: DesignSpec["margins"]): DesignSpec["margins"] {
  const unit = trim.unit;
  const min = MARGIN_MIN[unit];
  const colRoom = trim.w - MIN_COLUMN[unit];
  const textRoom = trim.h - MIN_TEXT[unit];

  const inner = clamp(margins.inner, min, Math.max(min, colRoom - min));
  const outer = clamp(margins.outer, min, Math.max(min, colRoom - inner));
  const top = clamp(margins.top, min, Math.max(min, textRoom - min));
  const bottom = clamp(margins.bottom, min, Math.max(min, textRoom - top));

  return {
    inner: roundForUnit(inner, unit),
    outer: roundForUnit(outer, unit),
    top: roundForUnit(top, unit),
    bottom: roundForUnit(bottom, unit),
  };
}

export function applyFontFamily(design: DesignSpec, family: string): DesignSpec {
  return { ...design, font: { ...design.font, family } };
}

export function applyFontSize(design: DesignSpec, sizePt: number): DesignSpec {
  const next = clamp(snap(sizePt, FONT_SIZE_STEP), FONT_SIZE_MIN, FONT_SIZE_MAX);
  const multiple = lineSpacingMultiple(design);
  return { ...design, font: withLeading(design.font, next, multiple) };
}

export function applyLineSpacing(design: DesignSpec, multiple: number): DesignSpec {
  const next = clamp(snap(multiple, LINE_SPACING_STEP), LINE_SPACING_MIN, LINE_SPACING_MAX);
  return { ...design, font: withLeading(design.font, design.font.sizePt, next) };
}

/** Set a whole trim (a preset). Converts margins if the unit changed. */
export function applyTrim(design: DesignSpec, trim: Trim): DesignSpec {
  const w = Math.max(TRIM_MIN[trim.unit], trim.w);
  const h = Math.max(TRIM_MIN[trim.unit], trim.h);
  const nextTrim: Trim = { w, h, unit: trim.unit };
  const margins =
    trim.unit === design.trim.unit ? design.margins : convertMargins(design.margins, design.trim.unit, trim.unit);
  return { ...design, trim: nextTrim, margins: clampMargins(nextTrim, margins) };
}

/** Set one custom dimension (width or height) in the current unit. */
export function applyCustomDimension(design: DesignSpec, key: "w" | "h", value: number): DesignSpec {
  const unit = design.trim.unit;
  const next = roundForUnit(clamp(value, TRIM_MIN[unit], 100 * (unit === "mm" ? 25.4 : 1)), unit);
  const nextTrim: Trim = { ...design.trim, [key]: next };
  return { ...design, trim: nextTrim, margins: clampMargins(nextTrim, design.margins) };
}

/** Switch the trim's unit, converting the trim and margins to preserve size. */
export function applyTrimUnit(design: DesignSpec, unit: Unit): DesignSpec {
  if (unit === design.trim.unit) return design;
  const from = design.trim.unit;
  const nextTrim: Trim = {
    w: convertLength(design.trim.w, from, unit),
    h: convertLength(design.trim.h, from, unit),
    unit,
  };
  const margins = convertMargins(design.margins, from, unit);
  return { ...design, trim: nextTrim, margins: clampMargins(nextTrim, margins) };
}

function convertMargins(
  margins: DesignSpec["margins"],
  from: Unit,
  to: Unit,
): DesignSpec["margins"] {
  return {
    inner: convertLength(margins.inner, from, to),
    outer: convertLength(margins.outer, from, to),
    top: convertLength(margins.top, from, to),
    bottom: convertLength(margins.bottom, from, to),
  };
}

export function applyMargin(
  design: DesignSpec,
  key: keyof DesignSpec["margins"],
  value: number,
): DesignSpec {
  const margins = clampMargins(design.trim, { ...design.margins, [key]: value });
  return { ...design, margins };
}

export function applyChapterDrop(design: DesignSpec, topDropPt: number): DesignSpec {
  const allowed = CHAPTER_DROPS.includes(topDropPt as (typeof CHAPTER_DROPS)[number])
    ? topDropPt
    : nearest(topDropPt, CHAPTER_DROPS);
  return { ...design, chapterOpening: { ...design.chapterOpening, topDropPt: allowed } };
}

export function applyStartRecto(design: DesignSpec, startRecto: boolean): DesignSpec {
  return { ...design, chapterOpening: { ...design.chapterOpening, startRecto } };
}

export function applyHeader(design: DesignSpec, side: "verso" | "recto", template: string): DesignSpec {
  return { ...design, runningHeader: { ...design.runningHeader, [side]: template } };
}

export function applyWidowControl(design: DesignSpec, widowControl: boolean): DesignSpec {
  return { ...design, widowControl };
}

export function applyHyphenation(design: DesignSpec, hyphenation: boolean): DesignSpec {
  return { ...design, hyphenation };
}

function nearest(value: number, options: readonly number[]): number {
  let best = options[0];
  for (const o of options) if (Math.abs(o - value) < Math.abs(best - value)) best = o;
  return best;
}

/**
 * True when going from `prev` to `next` changes the engine's page geometry.
 * False ONLY when the sole difference is running-header content, which the
 * renderer draws without a re-pagination.
 */
export function affectsPagination(prev: DesignSpec, next: DesignSpec): boolean {
  return paginationKey(prev) !== paginationKey(next);
}

/** A stable string of every field that changes page geometry (header excluded). */
function paginationKey(d: DesignSpec): string {
  return JSON.stringify([d.trim, d.font, d.margins, d.chapterOpening, d.widowControl, d.hyphenation]);
}
