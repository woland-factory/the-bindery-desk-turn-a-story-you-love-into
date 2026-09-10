// Typed, user-safe parse failures. Only whole-archive structural problems
// throw; a single bad chapter never does (it degrades to empty blocks).

export type ParseErrorCode = "too-large" | "not-a-zip" | "no-opf" | "empty-spine";

const MESSAGES: Record<ParseErrorCode, string> = {
  "too-large": "This file is larger than the limit.",
  "not-a-zip": "This file is not a readable EPUB.",
  "no-opf": "This file is not a readable EPUB.",
  "empty-spine": "This EPUB has no readable chapters.",
};

export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "ParseError";
    this.code = code;
  }
}

export function isParseError(err: unknown): err is ParseError {
  return err instanceof ParseError;
}
