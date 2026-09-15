import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_BOUNDS } from "../../engine/budget";
import { loadBounds, sanitizeBounds, saveBounds } from "./persistBudget";

const KEY = "bindery.budget";

beforeEach(() => {
  localStorage.clear();
});

describe("saveBounds / loadBounds round-trip", () => {
  it("restores saved bounds in the same browser", () => {
    saveBounds({ ...DEFAULT_BOUNDS, fontMinPt: 10, marginsMaxPct: 110 });
    const loaded = loadBounds();
    expect(loaded.fontMinPt).toBe(10);
    expect(loaded.marginsMaxPct).toBe(110);
  });

  it("returns DEFAULT_BOUNDS when nothing is stored", () => {
    expect(loadBounds()).toEqual(DEFAULT_BOUNDS);
  });

  it("returns DEFAULT_BOUNDS for a malformed blob", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadBounds()).toEqual(DEFAULT_BOUNDS);
  });
});

describe("forward-compatible merge", () => {
  it("ignores unknown keys and defaults missing ones", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, bounds: { fontMinPt: 10, mystery: 7 } }));
    const loaded = loadBounds();
    expect(loaded.fontMinPt).toBe(10);
    expect(loaded.spacingMin).toBe(DEFAULT_BOUNDS.spacingMin);
    expect("mystery" in loaded).toBe(false);
  });

  it("clamps out-of-range stored values to the rails", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, bounds: { fontMinPt: 1, fontMaxPt: 99, marginsMinPct: 500 } }),
    );
    const loaded = loadBounds();
    expect(loaded.fontMinPt).toBe(7);
    expect(loaded.fontMaxPt).toBe(18);
    // The crossed margin pair resolves deterministically.
    expect(loaded.marginsMinPct).toBe(150);
    expect(loaded.marginsMaxPct).toBe(150);
  });

  it("reads a bare bounds object (no version envelope)", () => {
    localStorage.setItem(KEY, JSON.stringify({ spacingMax: 1.4 }));
    expect(loadBounds().spacingMax).toBe(1.4);
  });

  it("sanitizes junk types to defaults", () => {
    expect(sanitizeBounds(null)).toEqual(DEFAULT_BOUNDS);
    expect(sanitizeBounds(42)).toEqual(DEFAULT_BOUNDS);
    expect(sanitizeBounds({ fontMinPt: "big" })).toEqual(DEFAULT_BOUNDS);
  });
});
