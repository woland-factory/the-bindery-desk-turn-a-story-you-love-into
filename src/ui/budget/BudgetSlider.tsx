import { useEffect, useState } from "react";
import {
  clampBounds,
  signaturesForSheets,
  MARGIN_SCALE_MAX_PCT,
  MARGIN_SCALE_MIN_PCT,
  type BudgetBounds,
} from "../../engine/budget";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_SPACING_MAX,
  LINE_SPACING_MIN,
  LINE_SPACING_STEP,
} from "../design/designPatch";

// The paper-budget surface: the "Fit into N sheets" slider, the sheet and
// signature readout, and the collapsed Bounds disclosure. The thumb and the
// visible target update in the same frame as the drag; the readout is one
// polite live region; the bounds are the solver's contract, never a direct
// design control.

export type Readout =
  | { kind: "waiting" }
  | { kind: "solving" }
  | { kind: "settled"; sheets: number }
  | { kind: "closest"; sheets: number }
  | { kind: "clamped-dense"; sheets: number }
  | { kind: "clamped-roomy"; sheets: number };

interface Props {
  min: number;
  max: number;
  /** The last outcome or settled sheets, or the drag value while dragging. */
  value: number;
  /** True until the first settled pass enables the slider. */
  disabled: boolean;
  /** True from a slider commit until its outcome (or supersession). */
  solving: boolean;
  readout: Readout;
  bounds: BudgetBounds;
  /** Fired per input event with the integer sheet target. */
  onTarget: (sheets: number) => void;
  onBounds: (next: BudgetBounds) => void;
}

function sheetsLabel(n: number): string {
  return n === 1 ? "1 sheet" : `${n} sheets`;
}

function signaturesLabel(n: number): string {
  return n === 1 ? "1 signature of 4 sheets" : `${n} signatures of 4 sheets`;
}

export function readoutText(readout: Readout): string {
  switch (readout.kind) {
    case "waiting":
      return "Laying out your book";
    case "solving":
      return "Fitting your book";
    case "settled":
      return `${sheetsLabel(readout.sheets)} · ${signaturesLabel(signaturesForSheets(readout.sheets))}`;
    case "closest":
      return `Closest inside your bounds: ${sheetsLabel(readout.sheets)}`;
    case "clamped-dense":
      return `Your bounds reach ${sheetsLabel(readout.sheets)} at the tightest. Loosen a bound to go lower.`;
    case "clamped-roomy":
      return `Your bounds reach ${sheetsLabel(readout.sheets)} at the roomiest. Loosen a bound to go higher.`;
  }
}

export function BudgetSlider({
  min,
  max,
  value,
  disabled,
  solving,
  readout,
  bounds,
  onTarget,
  onBounds,
}: Props) {
  // A very small book can collapse the range to one value; keep the readout,
  // quiet the slider.
  const sliderDisabled = disabled || min >= max;

  const commitBound = (patch: Partial<BudgetBounds>) => {
    onBounds(clampBounds({ ...bounds, ...patch }));
  };

  return (
    <section className="budget" aria-label="Paper budget">
      <div className="budget__control">
        <label className="budget__label" htmlFor="budget-target">
          Fit into
        </label>
        <input
          id="budget-target"
          className="budget__slider"
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={sliderDisabled}
          aria-valuetext={sheetsLabel(value)}
          onChange={(e) => onTarget(Math.round(Number(e.target.value)))}
        />
        <output className="budget__value" htmlFor="budget-target">
          {sheetsLabel(value)}
        </output>
      </div>

      <p className={`budget__readout${solving ? " budget__readout--busy" : ""}`} aria-live="polite">
        {readoutText(readout)}
      </p>

      <details className="budget__bounds">
        <summary>Bounds</summary>
        <fieldset className="budget__fields">
          <legend className="visually-hidden">Bounds</legend>
          <div className="field-row">
            <BoundField
              id="bound-font-min"
              label="Font size min (pt)"
              value={bounds.fontMinPt}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
              onCommit={(v) => commitBound({ fontMinPt: v })}
            />
            <BoundField
              id="bound-font-max"
              label="Font size max (pt)"
              value={bounds.fontMaxPt}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
              onCommit={(v) => commitBound({ fontMaxPt: v })}
            />
          </div>
          <div className="field-row">
            <BoundField
              id="bound-spacing-min"
              label="Line spacing min"
              value={bounds.spacingMin}
              min={LINE_SPACING_MIN}
              max={LINE_SPACING_MAX}
              step={LINE_SPACING_STEP}
              onCommit={(v) => commitBound({ spacingMin: v })}
            />
            <BoundField
              id="bound-spacing-max"
              label="Line spacing max"
              value={bounds.spacingMax}
              min={LINE_SPACING_MIN}
              max={LINE_SPACING_MAX}
              step={LINE_SPACING_STEP}
              onCommit={(v) => commitBound({ spacingMax: v })}
            />
          </div>
          <div className="field-row">
            <BoundField
              id="bound-margins-min"
              label="Margins min (%)"
              value={bounds.marginsMinPct}
              min={MARGIN_SCALE_MIN_PCT}
              max={MARGIN_SCALE_MAX_PCT}
              step={1}
              onCommit={(v) => commitBound({ marginsMinPct: v })}
            />
            <BoundField
              id="bound-margins-max"
              label="Margins max (%)"
              value={bounds.marginsMaxPct}
              min={MARGIN_SCALE_MIN_PCT}
              max={MARGIN_SCALE_MAX_PCT}
              step={1}
              onCommit={(v) => commitBound({ marginsMaxPct: v })}
            />
          </div>
        </fieldset>
      </details>
    </section>
  );
}

/**
 * A native number input whose text stays free to type into while focused; on
 * each finite value it commits (the parent clamps), and on blur it snaps back
 * to the committed value. Mirrors the control panel's dial behavior.
 */
function BoundField({
  id,
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onCommit(n);
        }}
      />
    </div>
  );
}
