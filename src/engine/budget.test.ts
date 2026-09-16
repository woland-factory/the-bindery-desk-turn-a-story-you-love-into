import { describe, it, expect } from "vitest";
import { DEFAULT_DESIGN } from "./defaultDesign";
import { computeMetrics } from "./paginate";
import type { Page, PaginationResult } from "./types";
import {
  clampBounds,
  DEFAULT_BOUNDS,
  ladderCandidates,
  PAGES_PER_SHEET,
  predictPages,
  sheetsForPages,
  SHEETS_PER_SIGNATURE,
  signaturesForSheets,
  statsForResult,
  type PassRef,
} from "./budget";
import { clampMargins } from "../ui/design/designPatch";

describe("sheet and signature arithmetic", () => {
  it("matches hand computations including edges", () => {
    expect(PAGES_PER_SHEET).toBe(4);
    expect(SHEETS_PER_SIGNATURE).toBe(4);
    // 0 and 1 pages still need one physical sheet.
    expect(sheetsForPages(0)).toBe(1);
    expect(sheetsForPages(1)).toBe(1);
    expect(sheetsForPages(4)).toBe(1); // exact multiple
    expect(sheetsForPages(5)).toBe(2);
    expect(sheetsForPages(16)).toBe(4);
    expect(sheetsForPages(17)).toBe(5);
    expect(sheetsForPages(301)).toBe(76);
  });

  it("counts signatures at 4 sheets each", () => {
    expect(signaturesForSheets(1)).toBe(1);
    expect(signaturesForSheets(4)).toBe(1); // exact multiple
    expect(signaturesForSheets(5)).toBe(2);
    expect(signaturesForSheets(16)).toBe(4);
    expect(signaturesForSheets(52)).toBe(13);
  });
});

describe("clampBounds", () => {
  it("clamps every value to its hard rails", () => {
    const clamped = clampBounds({
      fontMinPt: 2,
      fontMaxPt: 99,
      spacingMin: 0.2,
      spacingMax: 9,
      marginsMinPct: 10,
      marginsMaxPct: 400,
    });
    expect(clamped).toEqual({
      fontMinPt: 7,
      fontMaxPt: 18,
      spacingMin: 1,
      spacingMax: 2.5,
      marginsMinPct: 50,
      marginsMaxPct: 150,
    });
  });

  it("snaps to the dial steps", () => {
    const clamped = clampBounds({
      ...DEFAULT_BOUNDS,
      fontMinPt: 9.3,
      spacingMin: 1.17,
      marginsMinPct: 75.4,
    });
    expect(clamped.fontMinPt).toBe(9.5);
    expect(clamped.spacingMin).toBe(1.15);
    expect(clamped.marginsMinPct).toBe(75);
  });

  it("resolves a crossed pair by raising the max to the min, deterministically", () => {
    const clamped = clampBounds({
      ...DEFAULT_BOUNDS,
      fontMinPt: 14,
      fontMaxPt: 10,
      spacingMin: 2,
      spacingMax: 1.2,
      marginsMinPct: 130,
      marginsMaxPct: 90,
    });
    expect(clamped.fontMinPt).toBe(14);
    expect(clamped.fontMaxPt).toBe(14);
    expect(clamped.spacingMin).toBe(2);
    expect(clamped.spacingMax).toBe(2);
    expect(clamped.marginsMinPct).toBe(130);
    expect(clamped.marginsMaxPct).toBe(130);
  });

  it("falls back to the rail floor for non-finite input", () => {
    const clamped = clampBounds({ ...DEFAULT_BOUNDS, fontMinPt: Number.NaN });
    expect(clamped.fontMinPt).toBe(7);
  });
});

describe("ladderCandidates", () => {
  const candidates = ladderCandidates(DEFAULT_DESIGN, DEFAULT_BOUNDS);

  it("is deterministic: same inputs, same list", () => {
    expect(ladderCandidates(DEFAULT_DESIGN, DEFAULT_BOUNDS)).toEqual(candidates);
  });

  it("is deduplicated and ordered densest first", () => {
    const keys = candidates.map((c) =>
      JSON.stringify([c.font.sizePt, c.font.lineHeightPt, c.margins]),
    );
    expect(new Set(keys).size).toBe(keys.length);
    // The full lever lattice: fine enough that sheet targets stay reachable.
    expect(candidates.length).toBeGreaterThan(500);

    // The ends are the all-dense and all-roomy corners of the bounds.
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    expect(first.font.sizePt).toBe(DEFAULT_BOUNDS.fontMinPt);
    expect(first.font.lineHeightPt).toBe(
      Math.round(DEFAULT_BOUNDS.fontMinPt * DEFAULT_BOUNDS.spacingMin * 10) / 10,
    );
    expect(first.margins.inner).toBeLessThan(DEFAULT_DESIGN.margins.inner);
    expect(last.font.sizePt).toBe(DEFAULT_BOUNDS.fontMaxPt);
    expect(last.margins.inner).toBeGreaterThan(DEFAULT_DESIGN.margins.inner);

    // Densest first: the density proxy never moves backward along the list.
    const density = (c: (typeof candidates)[number]) => {
      const m = computeMetrics(c);
      return c.font.sizePt / (m.columnPx * m.bodyLinesPerPage);
    };
    for (let i = 1; i < candidates.length; i++) {
      expect(density(candidates[i])).toBeGreaterThanOrEqual(density(candidates[i - 1]) - 1e-12);
    }
  });

  it("keeps every candidate on the dial lattice and inside the bounds", () => {
    for (const c of candidates) {
      // Font on the 0.5pt grid, inside [fontMinPt, fontMaxPt].
      expect(Math.round(c.font.sizePt * 2) / 2).toBe(c.font.sizePt);
      expect(c.font.sizePt).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.fontMinPt);
      expect(c.font.sizePt).toBeLessThanOrEqual(DEFAULT_BOUNDS.fontMaxPt);
      // Leading encodes a spacing multiple on the 0.05 grid, rounded to 0.1pt.
      const multiple = c.font.lineHeightPt / c.font.sizePt;
      const snapped = Math.round(multiple * 20) / 20;
      expect(Math.abs(Math.round(c.font.sizePt * snapped * 10) / 10 - c.font.lineHeightPt)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(multiple).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.spacingMin - 0.03);
      expect(multiple).toBeLessThanOrEqual(DEFAULT_BOUNDS.spacingMax + 0.03);
      // Margins respect the engine's clamp (idempotent under clampMargins).
      expect(clampMargins(c.trim, c.margins)).toEqual(c.margins);
    }
  });

  it("carries every non-lever field verbatim from the base", () => {
    for (const c of candidates) {
      expect(c.trim).toEqual(DEFAULT_DESIGN.trim);
      expect(c.font.family).toBe(DEFAULT_DESIGN.font.family);
      expect(c.chapterOpening).toEqual(DEFAULT_DESIGN.chapterOpening);
      expect(c.runningHeader).toEqual(DEFAULT_DESIGN.runningHeader);
      expect(c.widowControl).toBe(DEFAULT_DESIGN.widowControl);
      expect(c.hyphenation).toBe(DEFAULT_DESIGN.hyphenation);
    }
  });

  it("collapses to a single candidate when the bounds pin all three levers", () => {
    const pinned = ladderCandidates(DEFAULT_DESIGN, {
      fontMinPt: 11,
      fontMaxPt: 11,
      spacingMin: 1.35,
      spacingMax: 1.35,
      marginsMinPct: 100,
      marginsMaxPct: 100,
    });
    expect(pinned).toHaveLength(1);
    expect(pinned[0].font.sizePt).toBe(11);
  });
});

describe("statsForResult", () => {
  it("tallies lines, openers, and blanks from the assembled pages", () => {
    const page = (kind: Page["kind"], lineCount: number, index: number): Page => ({
      index,
      side: index % 2 === 0 ? "recto" : "verso",
      kind,
      chapterIndex: kind === "blank" ? -1 : 0,
      lines: Array.from({ length: lineCount }, () => ({
        text: "x",
        x: 0,
        y: 0,
        width: 1,
        hyphenated: false,
      })),
    });
    const result: PaginationResult = {
      pageCount: 4,
      pages: [page("opener", 20, 0), page("body", 30, 1), page("blank", 0, 2), page("body", 5, 3)],
    };
    expect(statsForResult(result)).toEqual({ totalLines: 55, openerPages: 1, blankPages: 1 });
  });
});

describe("predictPages", () => {
  const metrics = computeMetrics(DEFAULT_DESIGN);
  const ref: PassRef = {
    design: DEFAULT_DESIGN,
    pageCount: 100,
    stats: {
      totalLines: 100 * metrics.bodyLinesPerPage - 37,
      openerPages: 3,
      blankPages: 2,
    },
  };

  it("is exact when the candidate is the reference design", () => {
    expect(predictPages(ref, DEFAULT_DESIGN)).toBe(100);
  });

  it("predicts more pages for a larger font and fewer for a smaller one", () => {
    const larger = {
      ...DEFAULT_DESIGN,
      font: { ...DEFAULT_DESIGN.font, sizePt: 13, lineHeightPt: 17.7 },
    };
    const smaller = {
      ...DEFAULT_DESIGN,
      font: { ...DEFAULT_DESIGN.font, sizePt: 9, lineHeightPt: 12.3 },
    };
    expect(predictPages(ref, larger)).toBeGreaterThan(100);
    expect(predictPages(ref, smaller)).toBeLessThan(100);
  });

  it("predicts fewer pages when smaller margins widen the column", () => {
    const wider = {
      ...DEFAULT_DESIGN,
      margins: clampMargins(DEFAULT_DESIGN.trim, {
        inner: DEFAULT_DESIGN.margins.inner * 0.75,
        outer: DEFAULT_DESIGN.margins.outer * 0.75,
        top: DEFAULT_DESIGN.margins.top * 0.75,
        bottom: DEFAULT_DESIGN.margins.bottom * 0.75,
      }),
    };
    expect(predictPages(ref, wider)).toBeLessThan(100);
  });

  it("predicts more pages when looser leading holds fewer lines per page", () => {
    const looser = {
      ...DEFAULT_DESIGN,
      font: { ...DEFAULT_DESIGN.font, lineHeightPt: 20.9 }, // 1.9 multiple
    };
    expect(predictPages(ref, looser)).toBeGreaterThan(100);
  });
});
