// Deterministic unit conversion on a fixed CSS px basis. Every geometry
// derivation flows through here so a given DesignSpec always yields the same
// numbers, on any machine, on every run.

/** 96 CSS px per inch (the CSS reference pixel). */
export const PX_PER_IN = 96;
/** 96/72 px per point. */
export const PX_PER_PT = 96 / 72;
/** 96/25.4 px per millimetre. */
export const PX_PER_MM = 96 / 25.4;

/** Points to CSS px. */
export function ptToPx(pt: number): number {
  return pt * PX_PER_PT;
}

/** Inches to CSS px. */
export function inToPx(inches: number): number {
  return inches * PX_PER_IN;
}

/** Millimetres to CSS px. */
export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

/** A length in the design's trim unit to CSS px. */
export function lengthToPx(value: number, unit: "in" | "mm"): number {
  return unit === "mm" ? mmToPx(value) : inToPx(value);
}

/**
 * Round a measured advance to a fixed precision (2 decimal places). Greedy
 * fit comparisons run on rounded widths so they never flip on float noise,
 * which keeps golden page counts stable across environments.
 */
export function roundPx(px: number): number {
  return Math.round(px * 100) / 100;
}
