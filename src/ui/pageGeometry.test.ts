import { describe, it, expect } from "vitest";
import { pagePlacement } from "./pageGeometry";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { computeMetrics } from "../engine/paginate";
import { lengthToPx } from "../engine/units";

describe("pagePlacement", () => {
  it("yields the half-letter leaf size for DEFAULT_DESIGN", () => {
    const recto = pagePlacement(DEFAULT_DESIGN, "recto");
    expect(recto.pageWidthPx).toBe(528);
    expect(recto.pageHeightPx).toBe(816);
  });

  it("mirrors the text-left offset: verso outer, recto inner", () => {
    const verso = pagePlacement(DEFAULT_DESIGN, "verso");
    const recto = pagePlacement(DEFAULT_DESIGN, "recto");
    expect(verso.textLeftPx).toBe(lengthToPx(0.5, "in")); // outer
    expect(recto.textLeftPx).toBe(lengthToPx(0.75, "in")); // inner
    // Inner (gutter) margin is larger, so recto's text starts further right.
    expect(recto.textLeftPx).toBeGreaterThan(verso.textLeftPx);
  });

  it("shares one column width with the engine on both sides", () => {
    const verso = pagePlacement(DEFAULT_DESIGN, "verso");
    const recto = pagePlacement(DEFAULT_DESIGN, "recto");
    const column = computeMetrics(DEFAULT_DESIGN).columnPx;
    expect(verso.columnPx).toBe(column);
    expect(recto.columnPx).toBe(column);
  });

  it("places the folio at the outer edge, mirrored by side", () => {
    expect(pagePlacement(DEFAULT_DESIGN, "verso").folioEdge).toBe("left");
    expect(pagePlacement(DEFAULT_DESIGN, "recto").folioEdge).toBe("right");
  });

  it("keeps the chrome line inside the top margin, above the text area", () => {
    const p = pagePlacement(DEFAULT_DESIGN, "recto");
    expect(p.chromeBaselinePx).toBeGreaterThan(0);
    expect(p.chromeBaselinePx).toBeLessThan(p.textTopPx);
  });
});
