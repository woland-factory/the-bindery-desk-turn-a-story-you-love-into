// The three guided-first-run steps. Each is one short imperative sentence
// anchored to a real control by its `data-tour` name. One place to sweep.

export interface TourStep {
  /** The `data-tour` attribute of the control this step points at. */
  anchor: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  { anchor: "sample", text: "Open the sample to see a real book." },
  { anchor: "slider", text: "Drag the slider to pick your sheet count." },
  { anchor: "export", text: "Click Export to save your two PDFs." },
];
