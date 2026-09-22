import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Dependency-free WCAG contrast audit. The theme tokens are the single source
// of the product's color; here we read them straight from styles.css (both the
// light `:root` and the dark `prefers-color-scheme` block) and prove every
// text/background pair the UI actually paints clears its threshold. A failing
// token is a real defect: darken or lighten it in styles.css until it passes.

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "..", "styles.css");
const css = readFileSync(cssPath, "utf8");

/** WCAG relative luminance for one sRGB channel (0..255). */
function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = hex.trim().replace("#", "");
  const full = n.length === 3 ? n.replace(/./g, (d) => d + d) : n;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two hex colors, from 1 (same) to 21 (max). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull the `--name: #hex;` declarations out of one CSS block. */
function parseTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

// The first `:root { ... }` is the light theme; the second (inside the dark
// media query) is the dark theme. `[^}]*` stops at each block's own brace.
const rootBlocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);

describe("contrastRatio helper", () => {
  it("returns 21 for black on white and ~1 for a color on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#7a4a1f", "#7a4a1f")).toBeCloseTo(1, 5);
  });
});

describe("theme contrast (parsed from styles.css)", () => {
  it("parses both a light and a dark token block", () => {
    expect(rootBlocks.length).toBeGreaterThanOrEqual(2);
  });

  const themes: Array<[string, number]> = [
    ["light", 0],
    ["dark", 1],
  ];

  for (const [name, index] of themes) {
    describe(name, () => {
      const t = parseTokens(rootBlocks[index] ?? "");

      it("defines every token the audit checks", () => {
        for (const key of ["--bg", "--surface", "--ink", "--ink-soft", "--accent", "--accent-ink", "--focus"]) {
          expect(t[key], `${name} ${key}`).toBeTruthy();
        }
      });

      // Body and secondary text must clear the 4.5:1 normal-text threshold on
      // both surfaces they appear over.
      it("body text (--ink) clears 4.5:1 on --bg and --surface", () => {
        expect(contrastRatio(t["--ink"], t["--bg"])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t["--ink"], t["--surface"])).toBeGreaterThanOrEqual(4.5);
      });

      it("secondary text (--ink-soft) clears 4.5:1 on --surface and --bg", () => {
        expect(contrastRatio(t["--ink-soft"], t["--surface"])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t["--ink-soft"], t["--bg"])).toBeGreaterThanOrEqual(4.5);
      });

      it("primary button label (--accent-ink on --accent) clears 4.5:1", () => {
        expect(contrastRatio(t["--accent-ink"], t["--accent"])).toBeGreaterThanOrEqual(4.5);
      });

      // Accent is used for normal-size link/label text (e.g. disclosure
      // summaries), so hold it to the full 4.5:1, not the large-text 3:1.
      it("accent text (--accent on --surface) clears 4.5:1", () => {
        expect(contrastRatio(t["--accent"], t["--surface"])).toBeGreaterThanOrEqual(4.5);
      });

      it("focus ring (--focus on --surface) clears 3:1", () => {
        expect(contrastRatio(t["--focus"], t["--surface"])).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
