import { roundPx } from "./units";
import type { Measurer, TextStyle } from "./measurer";
import type { Hyphenator } from "./hyphenate";

// Greedy (first-fit) line breaking over one paragraph using real advance
// widths, with Knuth-Liang hyphenation to break a word that overflows the
// column. Pure and measurer-injected. Widths are additive per word (each
// word measured once and cached), which is fast and deterministic; the space
// and hyphen advances are measured once per style.

/** The soft hyphen the engine inserts at a break inside a word. */
export const SOFT_HYPHEN = "­";

export interface BrokenLine {
  text: string;
  /** Measured advance width of `text` (hyphen counted when hyphenated). */
  width: number;
  hyphenated: boolean;
}

export interface LineBreakOptions {
  columnPx: number;
  style: TextStyle;
  measurer: Measurer;
  hyphenator: Hyphenator;
  hyphenation: boolean;
}

/**
 * Break one paragraph into lines that each fit `columnPx`. Never loses or
 * duplicates text: concatenating the lines (with soft hyphens stripped and
 * single spaces between them) reproduces the source paragraph.
 */
export function breakParagraph(text: string, opts: LineBreakOptions): BrokenLine[] {
  const { columnPx, style, measurer, hyphenation, hyphenator } = opts;
  const words = text.split(" ").filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const spaceWidth = measurer.measure(" ", style);
  const hyphenWidth = measurer.measure("-", style);
  const lines: BrokenLine[] = [];

  // Current line accumulator.
  let lineText = "";
  let lineWidth = 0;

  const pushLine = (extra: string, extraWidth: number, hyphenated: boolean) => {
    lines.push({ text: lineText + extra, width: roundPx(lineWidth + extraWidth), hyphenated });
    lineText = "";
    lineWidth = 0;
  };

  // A queue so a hyphenated remainder is reconsidered as the next "word".
  const queue = words.slice().reverse();

  while (queue.length > 0) {
    const word = queue.pop() as string;
    const wordWidth = measurer.measure(word, style);
    const gap = lineText === "" ? 0 : spaceWidth;

    if (roundPx(lineWidth + gap + wordWidth) <= columnPx) {
      lineText = lineText === "" ? word : `${lineText} ${word}`;
      lineWidth = roundPx(lineWidth + gap + wordWidth);
      continue;
    }

    // The word does not fit as-is.
    if (lineText !== "") {
      // Try to fill the rest of the line with a hyphenated prefix.
      const remaining = columnPx - roundPx(lineWidth + gap);
      const split = hyphenation
        ? splitToFit(word, remaining, hyphenWidth, style, measurer, hyphenator)
        : null;
      if (split) {
        lineText = `${lineText} ${split.prefix}${SOFT_HYPHEN}`;
        pushLine("", roundPx(gap + split.prefixWidth + hyphenWidth), true);
        queue.push(split.rest);
        continue;
      }
      // No prefix fits; end the line and reconsider the whole word next.
      pushLine("", 0, false);
      queue.push(word);
      continue;
    }

    // Line is empty and the word alone overflows the column.
    const split = hyphenation
      ? splitToFit(word, columnPx, hyphenWidth, style, measurer, hyphenator)
      : null;
    if (split) {
      pushLine(`${split.prefix}${SOFT_HYPHEN}`, roundPx(split.prefixWidth + hyphenWidth), true);
      queue.push(split.rest);
      continue;
    }
    // Unbreakable and over-long: place it on its own line (it may exceed the
    // column). Never drop text, never loop.
    pushLine(word, wordWidth, false);
  }

  if (lineText !== "") lines.push({ text: lineText, width: roundPx(lineWidth), hyphenated: false });
  return lines;
}

interface Split {
  prefix: string;
  prefixWidth: number;
  rest: string;
}

/**
 * Find the largest hyphenation prefix of `word` whose advance plus a hyphen
 * fits within `avail`. Returns null when no interior break point fits.
 */
function splitToFit(
  word: string,
  avail: number,
  hyphenWidth: number,
  style: TextStyle,
  measurer: Measurer,
  hyphenator: Hyphenator,
): Split | null {
  if (avail <= hyphenWidth) return null;
  const pieces = hyphenator(word);
  if (pieces.length < 2) return null;
  // Try the longest prefix first (fill the line as much as possible).
  for (let k = pieces.length - 1; k >= 1; k--) {
    const prefix = pieces.slice(0, k).join("");
    const prefixWidth = measurer.measure(prefix, style);
    if (roundPx(prefixWidth + hyphenWidth) <= avail) {
      return { prefix, prefixWidth, rest: pieces.slice(k).join("") };
    }
  }
  return null;
}

/**
 * Reassemble the source text from broken lines: strip soft hyphens and join
 * with single spaces. Used by tests to prove no text is lost or duplicated.
 */
export function reassemble(lines: BrokenLine[]): string {
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bare = line.text.split(SOFT_HYPHEN).join("");
    if (i === 0) {
      out = bare;
    } else if (lines[i - 1].hyphenated) {
      // A hyphenated break splits inside a word: no space between the pieces.
      out += bare;
    } else {
      out += ` ${bare}`;
    }
  }
  return out;
}
