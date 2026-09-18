import { describe, it, expect } from "vitest";
import { imposeBook, DEFAULT_IMPOSITION, type ImpositionPlan } from "./impose";

/** Flatten a plan's sides to [left, right] source pairs, in print order. */
function pairs(plan: ImpositionPlan): (number | null)[][] {
  return plan.sides.map((s) => [s.left.source, s.right.source]);
}

describe("imposeBook golden orderings", () => {
  it("folds an 8-page signature into the standard saddle-stitch order", () => {
    // One signature big enough to hold 8 pages, long edge.
    const plan = imposeBook(8, { sheetsPerSignature: 4, flip: "long-edge" });
    expect(pairs(plan)).toEqual([
      [8, 1], // front0
      [2, 7], // back0
      [6, 3], // front1
      [4, 5], // back1
    ]);
    expect(plan.paddedPageCount).toBe(8);
    expect(plan.signatureCount).toBe(1);
  });

  it("folds a 16-page signature into the standard saddle-stitch order", () => {
    const plan = imposeBook(16, { sheetsPerSignature: 4, flip: "long-edge" });
    expect(pairs(plan)).toEqual([
      [16, 1],
      [2, 15],
      [14, 3],
      [4, 13],
      [12, 5],
      [6, 11],
      [10, 7],
      [8, 9],
    ]);
  });
});

describe("imposeBook padding and signatures", () => {
  it("rounds a non-multiple of 4 up to whole sheets", () => {
    const plan = imposeBook(5, DEFAULT_IMPOSITION);
    expect(plan.paddedPageCount).toBe(8);
    // Padding pages sit past the real page count; they render blank downstream.
    const sources = plan.sides.flatMap((s) => [s.left.source, s.right.source]);
    expect(sources.some((v) => v !== null && v > 5)).toBe(true);
  });

  it("gives even a zero-page book one sheet of four pages", () => {
    const plan = imposeBook(0, DEFAULT_IMPOSITION);
    expect(plan.paddedPageCount).toBe(4);
    expect(plan.sides).toHaveLength(2); // one sheet = front + back
    expect(plan.signatureCount).toBe(1);
  });

  it("splits into signatures with a possibly shorter last one", () => {
    // 3 sheets per signature = 12 pages each. 40 pages -> 40 pages padded to 40
    // (multiple of 4): sigs of 12, 12, 12, then 4 (one sheet).
    const plan = imposeBook(40, { sheetsPerSignature: 3, flip: "long-edge" });
    expect(plan.paddedPageCount).toBe(40);
    expect(plan.signatureCount).toBe(4);
    // Total sides = 40 pages / 2 pages-per-side = 20.
    expect(plan.sides).toHaveLength(20);
  });

  it("keeps every source a valid 1..paddedPageCount index or null", () => {
    const plan = imposeBook(37, { sheetsPerSignature: 2, flip: "long-edge" });
    for (const side of plan.sides) {
      for (const placed of [side.left, side.right]) {
        expect(placed.source === null || (placed.source >= 1 && placed.source <= plan.paddedPageCount)).toBe(
          true,
        );
      }
    }
  });

  it("is deterministic: two identical calls are equal", () => {
    const a = imposeBook(53, { sheetsPerSignature: 4, flip: "short-edge" });
    const b = imposeBook(53, { sheetsPerSignature: 4, flip: "short-edge" });
    expect(a).toEqual(b);
  });
});

describe("imposeBook short-edge flip", () => {
  it("rotates back sides 180 and swaps their pages, leaving fronts untouched", () => {
    const plan = imposeBook(8, { sheetsPerSignature: 4, flip: "short-edge" });
    // Fronts identical to long edge, upright.
    expect(plan.sides[0]).toEqual({
      left: { source: 8, rotation: 0 },
      right: { source: 1, rotation: 0 },
    });
    expect(plan.sides[2]).toEqual({
      left: { source: 6, rotation: 0 },
      right: { source: 3, rotation: 0 },
    });
    // Backs: long-edge [2,7] and [4,5] become [7,2] and [5,4], both rotated 180.
    expect(plan.sides[1]).toEqual({
      left: { source: 7, rotation: 180 },
      right: { source: 2, rotation: 180 },
    });
    expect(plan.sides[3]).toEqual({
      left: { source: 5, rotation: 180 },
      right: { source: 4, rotation: 180 },
    });
  });
});
