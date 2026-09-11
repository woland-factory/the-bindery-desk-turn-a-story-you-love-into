// Data types for the pagination engine. These are pure, serializable shapes
// (plain objects, arrays, strings, numbers) so a PaginationResult clones
// cheaply across postMessage. No behavior lives here.

/** One design's page geometry, typography, and layout toggles. */
export interface DesignSpec {
  trim: { w: number; h: number; unit: "in" | "mm" };
  font: { family: string; sizePt: number; lineHeightPt: number; bold?: boolean };
  /** Margins in the same unit as `trim`. */
  margins: { inner: number; outer: number; top: number; bottom: number };
  chapterOpening: { topDropPt: number; startRecto: boolean };
  /** Carried for later EPICs; not rendered by the pagination engine. */
  runningHeader: { verso: string; recto: string; showOnOpener: boolean };
  widowControl: boolean;
  hyphenation: boolean;
}

/** One laid-out line within a page's text area. */
export interface Line {
  /** The exact substring laid out on this line (soft hyphen included when hyphenated). */
  text: string;
  /** Left offset within the text column, in px (0 at column start). */
  x: number;
  /** Baseline offset from the top of the text area, in px. */
  y: number;
  /** Measured advance width of `text`, in px. */
  width: number;
  /** True when the engine ended this line with an inserted soft hyphen. */
  hyphenated: boolean;
}

export type PageKind = "body" | "opener" | "blank";
export type PageSide = "recto" | "verso";

export interface Page {
  /** 0-based sequential page number. */
  index: number;
  /** recto = odd 1-based folio, verso = even. */
  side: PageSide;
  /** opener = a chapter starts here; blank = inserted spacer. */
  kind: PageKind;
  /** Chapter.order this page belongs to (-1 for a blank spacer). */
  chapterIndex: number;
  /** Empty for a blank page. */
  lines: Line[];
}

export interface PaginationResult {
  pageCount: number;
  pages: Page[];
  // `signatures` is intentionally omitted: imposition is a later EPIC.
}

/** Timing metadata attached at the edge, never fed back into layout. */
export interface Timings {
  wordCount: number;
  pageCount: number;
  /** request dispatch -> first `progress` message on main. */
  firstFeedbackMs: number;
  /** request dispatch -> `done` message on main. */
  settleMs: number;
}
