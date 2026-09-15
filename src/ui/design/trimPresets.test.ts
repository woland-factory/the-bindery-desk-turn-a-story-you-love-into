import { describe, it, expect } from "vitest";
import { convertLength, presetForTrim, TRIM_PRESETS } from "./trimPresets";

describe("TRIM_PRESETS", () => {
  it("includes the default half-letter trim as the first entry", () => {
    expect(TRIM_PRESETS[0].trim).toEqual({ w: 5.5, h: 8.5, unit: "in" });
  });

  it("carries each preset's own unit and values verbatim", () => {
    const a5 = TRIM_PRESETS.find((p) => p.id === "a5");
    expect(a5?.trim).toEqual({ w: 148, h: 210, unit: "mm" });
  });
});

describe("presetForTrim", () => {
  it("matches an exact preset and returns null for a custom size", () => {
    expect(presetForTrim({ w: 6, h: 9, unit: "in" })?.id).toBe("us-trade");
    expect(presetForTrim({ w: 5.5, h: 8.5, unit: "mm" })).toBeNull();
    expect(presetForTrim({ w: 5.7, h: 8.5, unit: "in" })).toBeNull();
  });
});

describe("convertLength", () => {
  it("preserves physical length across in↔mm, rounded per unit", () => {
    expect(convertLength(1, "in", "mm")).toBe(25);
    expect(convertLength(6, "in", "mm")).toBe(152);
    expect(convertLength(152, "mm", "in")).toBeCloseTo(5.98, 2);
    // A no-op conversion rounds to the unit's precision.
    expect(convertLength(5.5, "in", "in")).toBe(5.5);
  });
});
