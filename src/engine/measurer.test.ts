import { describe, it, expect, vi, afterEach } from "vitest";
import { SyntheticMeasurer, styleKey, type TextStyle } from "./measurer";
import { AverageAdvanceMeasurer, createRuntimeMeasurer } from "./offscreenMeasurer";

const style: TextStyle = { family: "test", sizePx: 12 };

describe("SyntheticMeasurer", () => {
  it("is a pure, deterministic function of (text, style)", () => {
    const m = new SyntheticMeasurer();
    expect(m.measure("hello", style)).toBe(m.measure("hello", style));
    expect(m.measure("", style)).toBe(0);
    // Longer text is never narrower.
    expect(m.measure("hello world", style)).toBeGreaterThan(m.measure("hello", style));
  });

  it("scales with font size and widens for bold", () => {
    const m = new SyntheticMeasurer();
    const small = m.measure("abc", { family: "t", sizePx: 10 });
    const large = m.measure("abc", { family: "t", sizePx: 20 });
    expect(large).toBeCloseTo(small * 2, 5);
    const bold = m.measure("abc", { family: "t", sizePx: 10, bold: true });
    expect(bold).toBeGreaterThan(small);
  });

  it("keys styles distinctly by size, weight, and family", () => {
    expect(styleKey({ family: "a", sizePx: 10 })).not.toBe(styleKey({ family: "a", sizePx: 11 }));
    expect(styleKey({ family: "a", sizePx: 10, bold: true })).not.toBe(
      styleKey({ family: "a", sizePx: 10 }),
    );
    expect(styleKey({ family: "a", sizePx: 10 })).not.toBe(styleKey({ family: "b", sizePx: 10 }));
  });
});

describe("createRuntimeMeasurer (fallback path)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("falls back to average advances where OffscreenCanvas is absent, warning once", () => {
    // jsdom has no OffscreenCanvas, so this exercises the documented fallback.
    expect(typeof OffscreenCanvas).toBe("undefined");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = createRuntimeMeasurer();
    expect(m).toBeInstanceOf(AverageAdvanceMeasurer);
    createRuntimeMeasurer(); // a second call must not warn again
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    expect(m.measure("word", style)).toBe(m.measure("word", style));
  });
});
