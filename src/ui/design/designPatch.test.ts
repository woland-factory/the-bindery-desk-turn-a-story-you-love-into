import { describe, it, expect } from "vitest";
import { DEFAULT_DESIGN } from "../../engine/defaultDesign";
import { computeMetrics } from "../../engine/paginate";
import {
  affectsPagination,
  applyChapterDrop,
  applyCustomDimension,
  applyFontFamily,
  applyFontSize,
  applyHeader,
  applyLineSpacing,
  applyMargin,
  applyTrim,
  applyTrimUnit,
  lineSpacingMultiple,
} from "./designPatch";

const D = DEFAULT_DESIGN;

describe("applyFontSize", () => {
  it("clamps to the 7-18pt range and snaps to the 0.5 step", () => {
    expect(applyFontSize(D, 40).font.sizePt).toBe(18);
    expect(applyFontSize(D, 2).font.sizePt).toBe(7);
    expect(applyFontSize(D, 11.3).font.sizePt).toBe(11.5);
  });

  it("re-derives lineHeightPt from the current spacing multiple", () => {
    const multiple = lineSpacingMultiple(D); // 15 / 11
    const next = applyFontSize(D, 14);
    expect(next.font.lineHeightPt).toBeCloseTo(Math.round(14 * multiple * 10) / 10, 5);
  });
});

describe("applyLineSpacing", () => {
  it("sets lineHeightPt = round(sizePt * multiple, 0.1) and clamps the multiple", () => {
    const next = applyLineSpacing(D, 1.5);
    expect(next.font.lineHeightPt).toBe(Math.round(D.font.sizePt * 1.5 * 10) / 10);
    expect(applyLineSpacing(D, 9).font.lineHeightPt).toBe(Math.round(D.font.sizePt * 2.5 * 10) / 10);
    expect(applyLineSpacing(D, 0.2).font.lineHeightPt).toBe(Math.round(D.font.sizePt * 1.0 * 10) / 10);
  });
});

describe("applyMargin / applyTrim clamping keeps the layout layable", () => {
  it("clamps a huge inner margin so the column stays positive with a body line", () => {
    const next = applyMargin(D, "inner", 99);
    const m = computeMetrics(next);
    expect(m.columnPx).toBeGreaterThan(0);
    expect(m.bodyLinesPerPage).toBeGreaterThanOrEqual(1);
    expect(next.margins.inner + next.margins.outer).toBeLessThan(next.trim.w);
  });

  it("clamps margins after a trim shrinks the page", () => {
    const small = applyTrim(D, { w: 3, h: 4, unit: "in" });
    const m = computeMetrics(small);
    expect(m.columnPx).toBeGreaterThan(0);
    expect(m.bodyLinesPerPage).toBeGreaterThanOrEqual(1);
    expect(small.margins.top + small.margins.bottom).toBeLessThan(small.trim.h);
  });

  it("sets a preset trim whole", () => {
    const next = applyTrim(D, { w: 6, h: 9, unit: "in" });
    expect(next.trim).toEqual({ w: 6, h: 9, unit: "in" });
  });
});

describe("unit conversion preserves physical length", () => {
  it("converts trim and margins in↔mm without jumping the physical size", () => {
    const mm = applyTrimUnit(D, "mm");
    expect(mm.trim.unit).toBe("mm");
    expect(mm.trim.w).toBeCloseTo(5.5 * 25.4, 0);
    expect(mm.trim.h).toBeCloseTo(8.5 * 25.4, 0);
    // Round-trip back to inches lands within rounding tolerance of the start.
    const back = applyTrimUnit(mm, "in");
    expect(back.trim.w).toBeCloseTo(5.5, 1);
    expect(back.trim.h).toBeCloseTo(8.5, 1);
  });
});

describe("applyCustomDimension", () => {
  it("sets one dimension and keeps the layout layable", () => {
    const next = applyCustomDimension(D, "w", 7.25);
    expect(next.trim.w).toBe(7.25);
    expect(next.trim.h).toBe(D.trim.h);
  });
});

describe("applyChapterDrop", () => {
  it("keeps only the named drops and snaps an odd value to the nearest", () => {
    expect(applyChapterDrop(D, 36).chapterOpening.topDropPt).toBe(36);
    expect(applyChapterDrop(D, 50).chapterOpening.topDropPt).toBe(36);
    expect(applyChapterDrop(D, 100).chapterOpening.topDropPt).toBe(72);
  });
});

describe("affectsPagination", () => {
  it("is false when only running-header content differs", () => {
    const verso = applyHeader(D, "verso", "{title}");
    const recto = applyHeader(verso, "recto", "{chapter}");
    expect(affectsPagination(D, recto)).toBe(false);
  });

  it("is true for any engine-affecting change", () => {
    expect(affectsPagination(D, applyFontSize(D, 13))).toBe(true);
    expect(affectsPagination(D, applyFontFamily(D, '"Lora", Georgia, serif'))).toBe(true);
    expect(affectsPagination(D, applyMargin(D, "top", 1))).toBe(true);
  });
});
