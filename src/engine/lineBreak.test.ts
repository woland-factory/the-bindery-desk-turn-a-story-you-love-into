import { describe, it, expect } from "vitest";
import { breakParagraph, reassemble, SOFT_HYPHEN, type LineBreakOptions } from "./lineBreak";
import { SyntheticMeasurer, type TextStyle } from "./measurer";
import { createHyphenator } from "./hyphenate";

// A uniform measurer: every non-space glyph is 1.0 * size, a space is 0.5,
// so widths are clean round numbers at size 10 (glyph 10px, space 5px).
const measurer = new SyntheticMeasurer({ " ": 0.5 }, 1);
const style: TextStyle = { family: "test", sizePx: 10 };
const hyphenator = createHyphenator("en");

function opts(columnPx: number, hyphenation = true): LineBreakOptions {
  return { columnPx, style, measurer, hyphenator, hyphenation };
}

describe("breakParagraph", () => {
  it("packs words greedily to the column width with correct break points", () => {
    // Each word "aa"/"bb"/... = 20px, a space = 5px. Column 50px holds two.
    const lines = breakParagraph("aa bb cc dd", opts(50));
    expect(lines.map((l) => l.text)).toEqual(["aa bb", "cc dd"]);
    expect(lines.map((l) => l.width)).toEqual([45, 45]);
    expect(lines.every((l) => !l.hyphenated)).toBe(true);
  });

  it("starts a new line exactly when the next word would overflow", () => {
    // "aaa"=30, +space+"bb"(20) = 55 > 50, so "bb" wraps.
    const lines = breakParagraph("aaa bb c", opts(50));
    expect(lines.map((l) => l.text)).toEqual(["aaa", "bb c"]);
  });

  it("hyphenates an over-long word at a valid point with a soft hyphen", () => {
    // "hyphenation" (11 glyphs = 110px) alone overflows an 80px column.
    // hypher -> ["hy","phen","ation"]; longest prefix that fits with a
    // hyphen (10px) is "hyphen" (60px): 60 + 10 = 70 <= 80.
    const lines = breakParagraph("hyphenation", opts(80));
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe(`hyphen${SOFT_HYPHEN}`);
    expect(lines[0].hyphenated).toBe(true);
    expect(lines[1].text).toBe("ation");
    expect(lines[1].hyphenated).toBe(false);
  });

  it("places an unbreakable over-long word on its own line without looping", () => {
    // "strength" has no interior hyphenation point; 8 glyphs = 80px > 60px.
    const lines = breakParagraph("strength", opts(60));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("strength");
    expect(lines[0].hyphenated).toBe(false);
    expect(lines[0].width).toBe(80);
  });

  it("changes the breaks when hyphenation is turned off", () => {
    const on = breakParagraph("hyphenation", opts(80, true));
    const off = breakParagraph("hyphenation", opts(80, false));
    expect(on.map((l) => l.text)).not.toEqual(off.map((l) => l.text));
    expect(off).toHaveLength(1);
    expect(off[0].text).toBe("hyphenation");
  });

  it("never loses or duplicates text (reassembly equals the source)", () => {
    const source =
      "The quick brown fox jumps over the lazy dog while a photographer documents the extraordinary hyphenation behaviour precisely";
    for (const col of [40, 55, 80, 120, 200]) {
      const lines = breakParagraph(source, opts(col));
      expect(reassemble(lines)).toBe(source);
    }
  });

  it("is deterministic across repeated runs", () => {
    const a = breakParagraph("hyphenation typography beautiful", opts(70));
    const b = breakParagraph("hyphenation typography beautiful", opts(70));
    expect(a).toEqual(b);
  });
});
