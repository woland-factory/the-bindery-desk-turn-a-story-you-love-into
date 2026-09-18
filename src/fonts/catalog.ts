// Curated font registry. Shared by the main thread (on-screen @font-face) and
// the worker (measurement), so it must stay free of any DOM or worker API. It
// is only data plus two pure lookups.
//
// The default system serif carries no files: its metrics resolve synchronously
// everywhere, so it never needs loading. Every other face is an open-licensed
// (SIL OFL 1.1) book face bundled as two woff2 weights under public/fonts/.
// Those are same-origin app assets, not an upload path, so fetching them does
// not break the "your book stays on your computer" norm.

export interface FontWeights {
  /** Root-relative URL of the regular (400) woff2. */
  regular: string;
  /** Root-relative URL of the bold (700) woff2. Headings render bold. */
  bold: string;
}

/**
 * TTF URLs the export worker embeds (subset) into the PDF. The on-screen woff2
 * subsetting path is unreliable, so export embeds a TTF of the same upstream
 * release, fetched only when an export runs. These files live under
 * public/fonts/embed/ and never load on the initial bundle.
 */
export interface FontEmbed {
  regular: string;
  bold: string;
}

export interface FontEntry {
  /** Stable id used for caching and warm requests. */
  id: string;
  /** Human label shown in the Font control. */
  label: string;
  /** Primary CSS family name used to build a FontFace. */
  family: string;
  /** The exact `font.family` stack written to the design (family + fallback). */
  stack: string;
  /** True for bundled faces that must be loaded before measuring/rendering. */
  embeddable: boolean;
  /** woff2 URLs; absent for the system serif. */
  weights?: FontWeights;
  /** TTF URLs for PDF embedding; absent for the system serif. */
  embed?: FontEmbed;
  /** Short license tag for provenance. */
  license?: string;
}

/** The shipped default. No files: the system serif resolves everywhere. */
export const SYSTEM_SERIF: FontEntry = {
  id: "system",
  label: "System serif",
  family: "Georgia",
  stack: 'Georgia, "Times New Roman", serif',
  embeddable: false,
};

export const FONT_CATALOG: FontEntry[] = [
  SYSTEM_SERIF,
  {
    id: "eb-garamond",
    label: "EB Garamond",
    family: "EB Garamond",
    stack: '"EB Garamond", Georgia, serif',
    embeddable: true,
    weights: {
      regular: "/fonts/eb-garamond-400.woff2",
      bold: "/fonts/eb-garamond-700.woff2",
    },
    embed: {
      regular: "/fonts/embed/eb-garamond-400.ttf",
      bold: "/fonts/embed/eb-garamond-700.ttf",
    },
    license: "OFL-1.1",
  },
  {
    id: "libre-baskerville",
    label: "Libre Baskerville",
    family: "Libre Baskerville",
    stack: '"Libre Baskerville", Georgia, serif',
    embeddable: true,
    weights: {
      regular: "/fonts/libre-baskerville-400.woff2",
      bold: "/fonts/libre-baskerville-700.woff2",
    },
    embed: {
      regular: "/fonts/embed/libre-baskerville-400.ttf",
      bold: "/fonts/embed/libre-baskerville-700.ttf",
    },
    license: "OFL-1.1",
  },
  {
    id: "lora",
    label: "Lora",
    family: "Lora",
    stack: '"Lora", Georgia, serif',
    embeddable: true,
    weights: {
      regular: "/fonts/lora-400.woff2",
      bold: "/fonts/lora-700.woff2",
    },
    embed: {
      regular: "/fonts/embed/lora-400.ttf",
      bold: "/fonts/embed/lora-700.ttf",
    },
    license: "OFL-1.1",
  },
  {
    id: "source-serif-4",
    label: "Source Serif 4",
    family: "Source Serif 4",
    stack: '"Source Serif 4", Georgia, serif',
    embeddable: true,
    weights: {
      regular: "/fonts/source-serif-4-400.woff2",
      bold: "/fonts/source-serif-4-700.woff2",
    },
    embed: {
      regular: "/fonts/embed/source-serif-4-400.ttf",
      bold: "/fonts/embed/source-serif-4-700.ttf",
    },
    license: "OFL-1.1",
  },
];

/** Match a design's `font.family` stack back to its catalog entry. */
export function entryForStack(stack: string): FontEntry | null {
  return FONT_CATALOG.find((e) => e.stack === stack) ?? null;
}

/** Look an entry up by its stable id. */
export function entryForId(id: string): FontEntry | null {
  return FONT_CATALOG.find((e) => e.id === id) ?? null;
}
