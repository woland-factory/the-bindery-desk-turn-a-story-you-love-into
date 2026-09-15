import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_DESIGN } from "../../engine/defaultDesign";
import { applyFontSize } from "./designPatch";
import { loadDesign, saveDesign, sanitizeDesign } from "./persistDesign";

const KEY = "bindery.design";

beforeEach(() => {
  localStorage.clear();
});

describe("saveDesign / loadDesign round-trip", () => {
  it("restores a saved design in the same browser", () => {
    const changed = applyFontSize(DEFAULT_DESIGN, 13);
    saveDesign(changed);
    expect(loadDesign().font.sizePt).toBe(13);
  });

  it("returns DEFAULT_DESIGN when nothing is stored", () => {
    expect(loadDesign()).toEqual(DEFAULT_DESIGN);
  });

  it("returns DEFAULT_DESIGN for a malformed blob", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadDesign()).toEqual(DEFAULT_DESIGN);
  });
});

describe("forward-compatible merge", () => {
  it("ignores unknown keys and defaults missing ones", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, design: { widowControl: false, mystery: 7 } }));
    const loaded = loadDesign();
    expect(loaded.widowControl).toBe(false);
    expect(loaded.trim).toEqual(DEFAULT_DESIGN.trim); // missing -> default
    expect("mystery" in loaded).toBe(false);
  });

  it("clamps out-of-range stored values", () => {
    const design = sanitizeDesign({
      font: { family: "Georgia, serif", sizePt: 99, lineHeightPt: 400 },
      margins: { inner: 50, outer: 50, top: 50, bottom: 50 },
    });
    expect(design.font.sizePt).toBe(18);
    expect(design.margins.inner + design.margins.outer).toBeLessThan(design.trim.w);
    expect(design.margins.top + design.margins.bottom).toBeLessThan(design.trim.h);
  });

  it("reads a bare design object (no version envelope)", () => {
    localStorage.setItem(KEY, JSON.stringify({ hyphenation: false }));
    expect(loadDesign().hyphenation).toBe(false);
  });
});
