// Minimal ambient types for the pure-JS hyphenation packages (no bundled
// types). Both are CommonJS; the bundler interop provides the default import.

declare module "hypher" {
  export default class Hypher {
    constructor(language: unknown);
    /** Split a word into pieces whose concatenation equals the word. */
    hyphenate(word: string): string[];
  }
}

declare module "hyphenation.en-us" {
  const patterns: unknown;
  export default patterns;
}
