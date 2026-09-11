import type { DesignSpec } from "./types";

// The single fixed default for this EPIC. There is no UI to edit it here;
// the controls that mutate a DesignSpec arrive in a later EPIC. Values are a
// half-letter trim (5.5 x 8.5 in) at a common home-bind body size.
export const DEFAULT_DESIGN: DesignSpec = {
  trim: { w: 5.5, h: 8.5, unit: "in" },
  font: { family: 'Georgia, "Times New Roman", serif', sizePt: 11, lineHeightPt: 15 },
  margins: { inner: 0.75, outer: 0.5, top: 0.6, bottom: 0.7 },
  chapterOpening: { topDropPt: 72, startRecto: true },
  runningHeader: { verso: "{author}", recto: "{title}", showOnOpener: false },
  widowControl: true,
  hyphenation: true,
};
