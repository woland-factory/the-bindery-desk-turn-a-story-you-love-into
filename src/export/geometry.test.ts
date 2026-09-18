import { describe, it, expect } from "vitest";
import type { DesignSpec, Line } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { PX_PER_PT } from "../engine/units";
import { pagePlacement } from "../ui/pageGeometry";
import { pxToPt, pagePointBox, lineBaselinePt } from "./geometry";

describe("pxToPt", () => {
  it("inverts the CSS-px basis (96 px per inch to 72 pt per inch)", () => {
    expect(pxToPt(96)).toBeCloseTo(72, 10);
    expect(pxToPt(PX_PER_PT)).toBeCloseTo(1, 10);
    expect(pxToPt(0)).toBe(0);
  });
});

describe("pagePointBox", () => {
  it("is the pagePlacement geometry divided by PX_PER_PT for each side", () => {
    for (const side of ["recto", "verso"] as const) {
      const p = pagePlacement(DEFAULT_DESIGN, side);
      const box = pagePointBox(DEFAULT_DESIGN, side);
      expect(box.pageWidthPt).toBeCloseTo(p.pageWidthPx / PX_PER_PT, 10);
      expect(box.pageHeightPt).toBeCloseTo(p.pageHeightPx / PX_PER_PT, 10);
      expect(box.textLeftPt).toBeCloseTo(p.textLeftPx / PX_PER_PT, 10);
      expect(box.textTopPt).toBeCloseTo(p.textTopPx / PX_PER_PT, 10);
      expect(box.columnPt).toBeCloseTo(p.columnPx / PX_PER_PT, 10);
      expect(box.folioEdge).toBe(p.folioEdge);
    }
  });

  it("gives the trim size in points a half-letter page expects", () => {
    // 5.5 x 8.5 in -> 396 x 612 pt.
    const box = pagePointBox(DEFAULT_DESIGN, "recto");
    expect(box.pageWidthPt).toBeCloseTo(396, 6);
    expect(box.pageHeightPt).toBeCloseTo(612, 6);
  });

  it("mirrors the text column across the gutter between verso and recto", () => {
    const recto = pagePointBox(DEFAULT_DESIGN, "recto");
    const verso = pagePointBox(DEFAULT_DESIGN, "verso");
    // recto uses the inner (larger) margin, verso the outer (smaller) one.
    expect(recto.textLeftPt).toBeGreaterThan(verso.textLeftPt);
    expect(recto.folioEdge).toBe("right");
    expect(verso.folioEdge).toBe("left");
  });
});

describe("lineBaselinePt", () => {
  const design: DesignSpec = DEFAULT_DESIGN;

  it("places the baseline half a leading plus the ascent below the line-box top", () => {
    const p = pagePlacement(design, "recto");
    const ascentRatio = 0.8;
    const l: Line = { text: "x", x: 0, y: 30, width: 10, hyphenated: false };
    const halfLeadingPx = (p.lineHeightPx - p.fontSizePx) / 2;
    const expectedPx = p.textTopPx + l.y + halfLeadingPx + p.fontSizePx * ascentRatio;
    expect(lineBaselinePt(p, l, ascentRatio)).toBeCloseTo(expectedPx / PX_PER_PT, 10);
  });

  it("advances one line height in points per line-box row", () => {
    const p = pagePlacement(design, "recto");
    const a = lineBaselinePt(p, { text: "a", x: 0, y: 0, width: 1, hyphenated: false }, 0.8);
    const b = lineBaselinePt(
      p,
      { text: "b", x: 0, y: p.lineHeightPx, width: 1, hyphenated: false },
      0.8,
    );
    expect(b - a).toBeCloseTo(p.lineHeightPx / PX_PER_PT, 10);
  });
});
