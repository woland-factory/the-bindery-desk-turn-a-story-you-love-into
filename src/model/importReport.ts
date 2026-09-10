// What the parser kept and set aside, for an honest import report.
// Counts are authoritative; `records` is a capped list for display.

import type { Block, Chapter } from "./document";

export type DropKind = "image" | "note" | "boilerplate";

export interface DropRecord {
  chapterOrder: number;
  chapterTitle: string;
  kind: DropKind;
  reason: string;
  /** Short label only: image src, note heading. Never full body text. */
  detail?: string;
}

export interface ImportReport {
  keptCounts: { headings: number; paragraphs: number; notes: number };
  droppedCounts: { images: number; notes: number; boilerplate: number };
  /** Capped for display. `*Counts` are the source of truth. */
  records: DropRecord[];
}

/** Upper bound on records kept for display, so a huge book stays light. */
export const MAX_DROP_RECORDS = 200;

export function emptyReport(): ImportReport {
  return {
    keptCounts: { headings: 0, paragraphs: 0, notes: 0 },
    droppedCounts: { images: 0, notes: 0, boilerplate: 0 },
    records: [],
  };
}

/**
 * Fold one chapter's blocks into the running report. Kept blocks update the
 * kept counts; dropped blocks update the dropped counts and append a record
 * (until the display cap is reached). Counts keep climbing past the cap.
 */
export function accumulateChapter(report: ImportReport, chapter: Chapter): void {
  for (const block of chapter.blocks) {
    if (block.keptOrDropped === "kept") {
      if (block.type === "heading") report.keptCounts.headings++;
      else if (block.type === "paragraph") report.keptCounts.paragraphs++;
      else if (block.type === "note") report.keptCounts.notes++;
      continue;
    }

    // Dropped blocks are only ever images or boilerplate: story notes are
    // kept (see §4 policy), so a dropped non-image block is boilerplate.
    const kind: DropKind = block.type === "image" ? "image" : "boilerplate";

    if (kind === "image") report.droppedCounts.images++;
    else report.droppedCounts.boilerplate++;

    if (report.records.length < MAX_DROP_RECORDS) {
      report.records.push({
        chapterOrder: chapter.order,
        chapterTitle: chapter.title,
        kind,
        reason: block.dropReason ?? kind,
        detail: detailFor(block),
      });
    }
  }
}

/** A short, privacy-safe label for a dropped block. Never the body text. */
function detailFor(block: Block): string | undefined {
  if (block.type === "image") return block.src ?? block.alt;
  // For dropped notes/boilerplate we keep only a short reason, never text.
  return undefined;
}
