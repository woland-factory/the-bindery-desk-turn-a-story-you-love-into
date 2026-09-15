import { clampBounds, DEFAULT_BOUNDS, type BudgetBounds } from "../../engine/budget";

// Session persistence of the solver bounds. Bounds only: no target, no file
// data, no book text, no PII. The blob is versioned and read with a
// forward-compatible merge onto DEFAULT_BOUNDS, then clamped, so a blob
// written by any version loads in any other. Every localStorage touch is
// guarded, so private-mode or disabled storage degrades silently.

const KEY = "bindery.budget";
const VERSION = 1;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Merge stored keys forward onto DEFAULT_BOUNDS, then clamp to the rails. */
export function sanitizeBounds(raw: unknown): BudgetBounds {
  const d = DEFAULT_BOUNDS;
  if (!isObject(raw)) return { ...d };
  return clampBounds({
    fontMinPt: num(raw.fontMinPt, d.fontMinPt),
    fontMaxPt: num(raw.fontMaxPt, d.fontMaxPt),
    spacingMin: num(raw.spacingMin, d.spacingMin),
    spacingMax: num(raw.spacingMax, d.spacingMax),
    marginsMinPct: num(raw.marginsMinPct, d.marginsMinPct),
    marginsMaxPct: num(raw.marginsMaxPct, d.marginsMaxPct),
  });
}

/** Read the stored bounds, or DEFAULT_BOUNDS when nothing valid is stored. */
export function loadBounds(): BudgetBounds {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_BOUNDS };
    const stored = localStorage.getItem(KEY);
    if (!stored) return { ...DEFAULT_BOUNDS };
    const parsed: unknown = JSON.parse(stored);
    const bounds = isObject(parsed) && "bounds" in parsed ? parsed.bounds : parsed;
    return sanitizeBounds(bounds);
  } catch {
    return { ...DEFAULT_BOUNDS };
  }
}

/** Persist the bounds. Never throws. */
export function saveBounds(bounds: BudgetBounds): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, bounds }));
  } catch {
    // Storage disabled or full: degrade to in-memory silently.
  }
}
