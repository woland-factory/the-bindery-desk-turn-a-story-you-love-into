import { describe, it, expect } from "vitest";
import { windowSpreads } from "./bookScroller";

const STRIDE = 100;
const VIEWPORT = 500;
const OVERSCAN = 2;

describe("windowSpreads", () => {
  it("windows the top of the book with leading overscan clamped at 0", () => {
    const w = windowSpreads(1000, STRIDE, 0, VIEWPORT, OVERSCAN);
    expect(w.firstSpread).toBe(0);
    // 5 visible rows (500/100) + 2 overscan below.
    expect(w.lastSpread).toBe(7);
    expect(w.topPadPx).toBe(0);
    expect(w.totalPx).toBe(100_000);
  });

  it("windows the middle around the scroll position", () => {
    const w = windowSpreads(1000, STRIDE, 5000, VIEWPORT, OVERSCAN);
    expect(w.firstSpread).toBe(48); // floor(5000/100) - 2
    expect(w.lastSpread).toBe(57); // floor(5500/100) + 2
    expect(w.topPadPx).toBe(4800);
  });

  it("clamps the last spread at the end of the book", () => {
    const w = windowSpreads(60, STRIDE, 6000, VIEWPORT, OVERSCAN);
    expect(w.lastSpread).toBe(59);
    expect(w.firstSpread).toBe(58);
  });

  it("keeps the window size bounded and independent of total count", () => {
    const small = windowSpreads(50, STRIDE, 2000, VIEWPORT, OVERSCAN);
    const huge = windowSpreads(500_000, STRIDE, 2000, VIEWPORT, OVERSCAN);
    const size = (w: ReturnType<typeof windowSpreads>) => w.lastSpread - w.firstSpread + 1;
    expect(size(small)).toBe(size(huge));
    expect(size(huge)).toBeLessThanOrEqual(VIEWPORT / STRIDE + 2 * OVERSCAN + 2);
  });

  it("returns an empty window for a book with no spreads", () => {
    const w = windowSpreads(0, STRIDE, 0, VIEWPORT, OVERSCAN);
    expect(w).toEqual({ firstSpread: 0, lastSpread: -1, topPadPx: 0, totalPx: 0 });
  });

  it("never divides by a zero stride", () => {
    const w = windowSpreads(10, 0, 0, VIEWPORT, OVERSCAN);
    expect(Number.isFinite(w.firstSpread)).toBe(true);
    expect(Number.isFinite(w.lastSpread)).toBe(true);
  });
});
