// The in-memory book model. This is the contract the pagination engine
// (a later EPIC) walks repeatedly, so it must be fully materialized:
// flat arrays of typed text blocks, no retained DOM nodes, no reference
// back to the ZIP or the unzipped file map. Parse once, keep this, let
// everything else be garbage-collected.

export type BlockType = "heading" | "paragraph" | "image" | "note";
export type KeptOrDropped = "kept" | "dropped";

export interface Block {
  type: BlockType;
  keptOrDropped: KeptOrDropped;
  /** Heading level 1..6 (headings only). */
  level?: number;
  /** Normalized plain text (heading, paragraph, note). */
  text?: string;
  /** Image href resolved relative to the chapter document. */
  src?: string;
  /** Image alt text, if present. */
  alt?: string;
  /** Why a block was dropped (image | note | boilerplate). Never body text. */
  dropReason?: string;
}

export interface Chapter {
  /** Stable within the document (spine idref or path). */
  id: string;
  /** From TOC, else first heading, else `Chapter {n}`. */
  title: string;
  /** 0-based reading order. */
  order: number;
  /** Flat, in reading order. Kept blocks plus recorded-dropped blocks. */
  blocks: Block[];
}

export interface Document {
  title: string;
  /** Joined creators; empty string if none. */
  author: string;
  /** BCP-47 from OPF metadata; "" if absent. */
  language: string;
  /** Ordered by spine. */
  chapters: Chapter[];
  /** Provenance only. No bytes retained. */
  source: { name: string; byteLength: number };
}

/** Count the kept story blocks in a chapter (headings + paragraphs + notes). */
export function keptBlockCount(chapter: Chapter): number {
  let n = 0;
  for (const b of chapter.blocks) {
    if (b.keptOrDropped === "kept") n++;
  }
  return n;
}
