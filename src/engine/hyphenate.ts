import Hypher from "hypher";
import enUs from "hyphenation.en-us";

// Knuth-Liang hyphenation via hypher. Deterministic and pure: the same word
// always yields the same syllable pieces. Language is selected from the
// Document, falling back to en-us. Results are memoized (speed only, never a
// change in output).

/** Splits a word into pieces whose concatenation equals the word. */
export type Hyphenator = (word: string) => string[];

const enUsHypher = new Hypher(enUs);

/**
 * Build a memoized hyphenator for a language tag. Only en-us patterns ship in
 * this EPIC; any language falls back to them (the wrapper is language-shaped
 * so a later EPIC can add pattern sets without changing callers).
 */
export function createHyphenator(_language: string): Hyphenator {
  const cache = new Map<string, string[]>();
  return (word: string): string[] => {
    const hit = cache.get(word);
    if (hit) return hit;
    // hypher preserves the exact characters; concatenating the pieces
    // reproduces the word. A word with no interior break returns [word].
    const pieces = word.length > 1 ? enUsHypher.hyphenate(word) : [word];
    cache.set(word, pieces);
    return pieces;
  };
}
