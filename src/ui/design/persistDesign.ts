import type { DesignSpec } from "../../engine/types";
import { DEFAULT_DESIGN } from "../../engine/defaultDesign";
import {
  applyChapterDrop,
  applyFontSize,
  applyLineSpacing,
  applyTrim,
  clampMargins,
  lineSpacingMultiple,
} from "./designPatch";

// Session persistence of the working design. Design only: no file bytes, no
// file name, no book text, no PII. The stored blob is versioned and read with a
// forward-compatible merge onto DEFAULT_DESIGN, so a blob written by any version
// loads in any other. Every localStorage touch is guarded, so private-mode or
// disabled storage degrades to in-memory instead of crashing.

const KEY = "bindery.design";
const VERSION = 1;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Merge stored fields forward onto DEFAULT_DESIGN and clamp every value through
 * the same setters the controls use, so an out-of-range or partial blob still
 * yields a design the engine can lay out. Unknown keys are ignored; missing
 * keys default.
 */
export function sanitizeDesign(raw: unknown): DesignSpec {
  let d = deepClone(DEFAULT_DESIGN);
  if (!isObject(raw)) return d;

  // Trim (unit first, then dimensions in that unit).
  if (isObject(raw.trim)) {
    const unit = raw.trim.unit === "mm" ? "mm" : raw.trim.unit === "in" ? "in" : d.trim.unit;
    d.trim = {
      w: num(raw.trim.w, d.trim.w),
      h: num(raw.trim.h, d.trim.h),
      unit,
    };
  }

  // Font.
  if (isObject(raw.font)) {
    d.font = {
      ...d.font,
      family: str(raw.font.family, d.font.family),
      sizePt: num(raw.font.sizePt, d.font.sizePt),
      lineHeightPt: num(raw.font.lineHeightPt, d.font.lineHeightPt),
    };
  }

  // Margins.
  if (isObject(raw.margins)) {
    d.margins = {
      inner: num(raw.margins.inner, d.margins.inner),
      outer: num(raw.margins.outer, d.margins.outer),
      top: num(raw.margins.top, d.margins.top),
      bottom: num(raw.margins.bottom, d.margins.bottom),
    };
  }

  // Chapter opening.
  if (isObject(raw.chapterOpening)) {
    d.chapterOpening = {
      topDropPt: num(raw.chapterOpening.topDropPt, d.chapterOpening.topDropPt),
      startRecto: bool(raw.chapterOpening.startRecto, d.chapterOpening.startRecto),
    };
  }

  // Running header (render-only content).
  if (isObject(raw.runningHeader)) {
    d.runningHeader = {
      verso: str(raw.runningHeader.verso, d.runningHeader.verso),
      recto: str(raw.runningHeader.recto, d.runningHeader.recto),
      showOnOpener: bool(raw.runningHeader.showOnOpener, d.runningHeader.showOnOpener),
    };
  }

  d.widowControl = bool(raw.widowControl, d.widowControl);
  d.hyphenation = bool(raw.hyphenation, d.hyphenation);

  // Clamp through the control setters so every field lands in range and the
  // geometry stays layable.
  d = applyTrim(d, d.trim);
  d.margins = clampMargins(d.trim, d.margins);
  d = applyFontSize(d, d.font.sizePt);
  d = applyLineSpacing(d, lineSpacingMultiple(d));
  d = applyChapterDrop(d, d.chapterOpening.topDropPt);
  return d;
}

/** Read the working design, or DEFAULT_DESIGN when nothing valid is stored. */
export function loadDesign(): DesignSpec {
  try {
    if (typeof localStorage === "undefined") return deepClone(DEFAULT_DESIGN);
    const stored = localStorage.getItem(KEY);
    if (!stored) return deepClone(DEFAULT_DESIGN);
    const parsed: unknown = JSON.parse(stored);
    const design = isObject(parsed) && "design" in parsed ? parsed.design : parsed;
    return sanitizeDesign(design);
  } catch {
    return deepClone(DEFAULT_DESIGN);
  }
}

/** Persist the working design. Never throws. */
export function saveDesign(design: DesignSpec): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, design }));
  } catch {
    // Storage disabled or full: degrade to in-memory silently.
  }
}
