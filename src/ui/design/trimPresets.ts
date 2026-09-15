import type { DesignSpec } from "../../engine/types";

// Curated page sizes for home binding, plus unit conversion. Pure and
// DOM-free. Presets carry their own unit and values verbatim; the control sets
// them whole. "Custom size" is not a preset: it is the panel's escape hatch for
// arbitrary dimensions.

export type Unit = "in" | "mm";
export type Trim = DesignSpec["trim"];

export interface TrimPreset {
  id: string;
  label: string;
  trim: Trim;
}

/** Common home-bind trims. The first matches DEFAULT_DESIGN. */
export const TRIM_PRESETS: TrimPreset[] = [
  { id: "half-letter", label: "Half letter", trim: { w: 5.5, h: 8.5, unit: "in" } },
  { id: "us-trade", label: "US Trade", trim: { w: 6, h: 9, unit: "in" } },
  { id: "pocket", label: "Pocket", trim: { w: 4.25, h: 6.87, unit: "in" } },
  { id: "a5", label: "A5", trim: { w: 148, h: 210, unit: "mm" } },
  { id: "a6", label: "A6", trim: { w: 105, h: 148, unit: "mm" } },
];

const MM_PER_IN = 25.4;

/** Round a length to the natural precision of its unit. */
export function roundForUnit(value: number, unit: Unit): number {
  return unit === "mm" ? Math.round(value) : Math.round(value * 100) / 100;
}

/** Convert a physical length between units, preserving size, rounded per unit. */
export function convertLength(value: number, from: Unit, to: Unit): number {
  if (from === to) return roundForUnit(value, to);
  const raw = from === "in" ? value * MM_PER_IN : value / MM_PER_IN;
  return roundForUnit(raw, to);
}

/** The preset whose trim exactly matches, or null for a custom size. */
export function presetForTrim(trim: Trim): TrimPreset | null {
  return (
    TRIM_PRESETS.find(
      (p) => p.trim.unit === trim.unit && p.trim.w === trim.w && p.trim.h === trim.h,
    ) ?? null
  );
}
