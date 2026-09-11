import { describe, it, expect } from "vitest";
import { ptToPx, inToPx, mmToPx, lengthToPx, roundPx, PX_PER_IN, PX_PER_PT } from "./units";

describe("units", () => {
  it("pins the px basis constants", () => {
    expect(PX_PER_IN).toBe(96);
    expect(PX_PER_PT).toBe(96 / 72);
  });

  it("converts points to px on the 96/72 basis", () => {
    expect(ptToPx(72)).toBe(96);
    expect(ptToPx(11)).toBeCloseTo(14.6667, 3);
    expect(ptToPx(0)).toBe(0);
  });

  it("converts inches and millimetres to px", () => {
    expect(inToPx(1)).toBe(96);
    expect(inToPx(5.5)).toBe(528);
    expect(mmToPx(25.4)).toBeCloseTo(96, 6);
  });

  it("routes trim units through lengthToPx", () => {
    expect(lengthToPx(5.5, "in")).toBe(528);
    expect(lengthToPx(25.4, "mm")).toBeCloseTo(96, 6);
  });

  it("rounds advances to a fixed precision so comparisons never flip on noise", () => {
    expect(roundPx(3.14159)).toBe(3.14);
    expect(roundPx(3.145)).toBe(3.15);
    expect(roundPx(10)).toBe(10);
    // idempotent
    expect(roundPx(roundPx(2.718281828))).toBe(roundPx(2.718281828));
  });
});
