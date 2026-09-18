import type { DesignSpec } from "../engine/types";
import { entryForStack, entryForId } from "../fonts/catalog";

// Resolve a design to the face the PDF embeds. The four OFL faces embed their
// own TTF, so the file reproduces the measured layout exactly. The default
// system serif has no bundled file (it is the OS Georgia), so export
// substitutes a designated fallback serif. Because the engine's lines are
// pre-broken and left aligned, a face whose metrics differ slightly can never
// re-break a line or change the page count, so the substitution is safe and is
// documented in PROVENANCE.md.

/** The bundled serif that stands in for the OS system serif on export. */
export const FALLBACK_SERIF_ID = "lora";

export interface ExportFont {
  /** Root-relative URL of the regular-weight TTF to fetch and embed. */
  regularUrl: string;
  /** Catalog id of the face actually embedded. */
  faceId: string;
  /** True when this substitutes the fallback for the OS system serif. */
  substituted: boolean;
}

export function resolveExportFont(design: DesignSpec): ExportFont {
  const entry = entryForStack(design.font.family);
  if (entry?.embed) {
    return { regularUrl: entry.embed.regular, faceId: entry.id, substituted: false };
  }
  const fallback = entryForId(FALLBACK_SERIF_ID);
  if (!fallback?.embed) {
    // The catalog always carries the fallback's embed URLs; this guards a bad
    // edit rather than a runtime path.
    throw new Error("The fallback serif is missing its embed files.");
  }
  return { regularUrl: fallback.embed.regular, faceId: fallback.id, substituted: true };
}
