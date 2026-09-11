import { roundPx } from "./units";

// Line breaking depends on real advance widths, but jsdom has no text
// metrics and no OffscreenCanvas, and the algorithm must be unit-testable
// deterministically. So measurement is an injected interface.

export interface TextStyle {
  /** CSS font-family list from the DesignSpec. */
  family: string;
  /** Font size in CSS px (derived from sizePt). */
  sizePx: number;
  /** Body text is regular; headings may set this. */
  bold?: boolean;
}

export interface Measurer {
  /**
   * Advance width of `text` at `style`, in CSS px. Must be a pure function of
   * (text, style) for the lifetime of the measurer.
   */
  measure(text: string, style: TextStyle): number;
}

/** Stable key for a style, used to scope measurement caches. */
export function styleKey(style: TextStyle): string {
  return `${style.sizePx}|${style.bold ? "b" : "r"}|${style.family}`;
}

/**
 * A deterministic measurer with no platform dependency. Width is a fixed
 * per-character advance (scaled to the style's size) so tests can construct
 * exact line-fill scenarios and assert precise break points and page counts.
 * Runs in jsdom.
 */
export class SyntheticMeasurer implements Measurer {
  /**
   * Per-character advance as a fraction of font size. A default covers any
   * character not listed. Bold widens uniformly.
   */
  private readonly advances: Record<string, number>;
  private readonly defaultAdvance: number;

  constructor(advances: Record<string, number> = DEFAULT_ADVANCES, defaultAdvance = 0.5) {
    this.advances = advances;
    this.defaultAdvance = defaultAdvance;
  }

  measure(text: string, style: TextStyle): number {
    let units = 0;
    for (const ch of text) {
      units += this.advances[ch] ?? this.defaultAdvance;
    }
    const boldFactor = style.bold ? 1.08 : 1;
    return roundPx(units * style.sizePx * boldFactor);
  }
}

// A small, deterministic advance table. Exact values are arbitrary; tests
// depend only on their stability, not on matching any real font.
const DEFAULT_ADVANCES: Record<string, number> = {
  " ": 0.25,
  i: 0.28,
  l: 0.28,
  t: 0.33,
  m: 0.83,
  w: 0.77,
  "-": 0.33,
  ".": 0.25,
  ",": 0.25,
};
