import type { Document } from "../model/document";
import type { ImportReport } from "../model/importReport";
import { emptyReport, accumulateChapter } from "../model/importReport";
import { unzip } from "./unzip";
import { findOpfPath } from "./container";
import { parseOpf } from "./opf";
import { parseToc } from "./toc";
import { buildChapters } from "./chapters";
import { ParseError } from "./errors";

/** Default input size cap. An over-cap file is rejected before unzip. */
export const MAX_EPUB_BYTES = 64 * 1024 * 1024;

export interface ParseResult {
  document: Document;
  report: ImportReport;
}

/**
 * Parse EPUB bytes into a fully-materialized Document plus an import report.
 * Pure over its input: no network, no globals, no retained references to
 * the bytes, the unzipped file map, or any DOM node once it returns. The
 * pagination engine can walk the returned Document repeatedly without ever
 * touching the archive again.
 *
 * Throws a typed ParseError only for whole-archive structural failures
 * (too large, not a zip, no OPF, empty spine). A single bad chapter is
 * contained, not fatal.
 */
export function parseEpub(
  bytes: Uint8Array,
  sourceName: string,
  maxBytes: number = MAX_EPUB_BYTES,
): ParseResult {
  if (bytes.byteLength > maxBytes) throw new ParseError("too-large");

  const files = unzip(bytes);
  const opfPath = findOpfPath(files);
  const opf = parseOpf(files, opfPath);
  const toc = parseToc(files, opf);
  const chapters = buildChapters(files, opf, toc);

  const report = emptyReport();
  for (const chapter of chapters) accumulateChapter(report, chapter);

  const document: Document = {
    title: opf.metadata.title,
    author: opf.metadata.author,
    language: opf.metadata.language,
    chapters,
    source: { name: sourceName, byteLength: bytes.byteLength },
  };

  // `files` and all DOM nodes fall out of scope here and are collected;
  // nothing downstream can re-read the archive.
  return { document, report };
}
