import { useEffect, useRef, useState } from "react";
import type { DesignSpec } from "../engine/types";
import { FONT_CATALOG } from "../fonts/catalog";
import {
  applyChapterDrop,
  applyCustomDimension,
  applyFontFamily,
  applyFontSize,
  applyHeader,
  applyHyphenation,
  applyLineSpacing,
  applyMargin,
  applyStartRecto,
  applyTrim,
  applyTrimUnit,
  applyWidowControl,
  CHAPTER_DROPS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_SPACING_MAX,
  LINE_SPACING_MIN,
  LINE_SPACING_STEP,
  lineSpacingMultiple,
} from "./design/designPatch";
import { presetForTrim, TRIM_PRESETS, type Unit } from "./design/trimPresets";
import type { ExportUiState } from "./BookPreview";
import {
  DEFAULT_IMPOSITION,
  SHEETS_PER_SIGNATURE_OPTIONS,
  type ImpositionOptions,
} from "../export/impose";

// The dials. Native, labeled, controlled inputs over the active design; each
// change produces a new design via a pure setter and calls onChange. Export is
// the one visually primary action; every dial is visibly subordinate. Print
// setup hides behind a disclosure with sensible defaults, so the common path is
// one click. Reset returns to the shipped default.

interface Props {
  design: DesignSpec;
  onChange: (next: DesignSpec) => void;
  onReset: () => void;
  /** Called when the Font control gains focus, so the app can warm faces. */
  onFontFocus?: () => void;
  /** True once the preview has settled at least one page. */
  canExport?: boolean;
  /** Live export status, driving the button label and the status line. */
  exportState?: ExportUiState;
  /** Fired on an Export click. */
  onExport?: () => void;
  /** The imposition options the print-setup controls edit. */
  imposition?: ImpositionOptions;
  /** Fired when a print-setup control changes; edits imposition only. */
  onImposition?: (next: ImpositionOptions) => void;
}

const FLIP_LABELS: Record<ImpositionOptions["flip"], string> = {
  "long-edge": "Long edge",
  "short-edge": "Short edge",
};

/** The button label while an export runs, naming the phase and page. */
function exportLabel(state: ExportUiState | undefined): string {
  if (state?.kind === "running") {
    return state.phase === "typeset"
      ? `Typesetting page ${state.done} of ${state.total}`
      : "Building signatures";
  }
  return "Export";
}

const HEADER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None" },
  { value: "{author}", label: "Author" },
  { value: "{title}", label: "Title" },
  { value: "{chapter}", label: "Chapter" },
];

const DROP_LABELS: Record<number, string> = { 72: "Deep", 36: "Standard", 0: "Minimal" };

const CUSTOM = "custom";

export function ControlPanel({
  design,
  onChange,
  onReset,
  onFontFocus,
  canExport = false,
  exportState = { kind: "idle" },
  onExport,
  imposition = DEFAULT_IMPOSITION,
  onImposition,
}: Props) {
  const unit = design.trim.unit;
  const marginStep = unit === "mm" ? 1 : 0.05;
  const marginMin = unit === "mm" ? 4 : 0.15;

  // Custom-size reveal. Driven locally, but re-derived whenever the design
  // changes from outside (a preset pick or Reset) so the select stays honest.
  const preset = presetForTrim(design.trim);
  const [customMode, setCustomMode] = useState(preset == null);
  const prevDesign = useRef(design);
  useEffect(() => {
    if (design !== prevDesign.current) {
      prevDesign.current = design;
      setCustomMode(presetForTrim(design.trim) == null);
    }
  }, [design]);

  const onPageSize = (value: string) => {
    if (value === CUSTOM) {
      setCustomMode(true);
      return;
    }
    const chosen = TRIM_PRESETS.find((p) => p.id === value);
    if (chosen) onChange(applyTrim(design, chosen.trim));
  };

  const spacingValue = round(lineSpacingMultiple(design), LINE_SPACING_STEP);
  const pageSizeValue = customMode ? CUSTOM : (preset?.id ?? CUSTOM);

  return (
    <section className="panel" aria-label="Book design">
      <div className="panel__primary">
        <button
          type="button"
          className="btn btn--primary panel__export"
          data-tour="export"
          disabled={!canExport || exportState.kind === "running"}
          aria-busy={exportState.kind === "running"}
          onClick={onExport}
        >
          {exportLabel(exportState)}
        </button>
        <p className="panel__hint">Export saves a print-ready PDF.</p>

        <p className="panel__status" role="status" aria-live="polite">
          {exportState.kind === "done"
            ? "Saved two files."
            : exportState.kind === "error"
              ? "The export stopped before it finished. Try again."
              : ""}
        </p>
        {exportState.kind === "done" && (
          <div className="panel__downloads">
            {exportState.downloads.map((d) => (
              <a key={d.filename} href={d.url} download={d.filename} className="panel__download">
                {d.label}
              </a>
            ))}
          </div>
        )}

        <details className="panel__print">
          <summary>Print setup</summary>
          <fieldset className="panel__print-fields">
            <legend className="visually-hidden">Print setup</legend>
            <div className="field">
              <label htmlFor="sheets-per-signature">Sheets per signature</label>
              <select
                id="sheets-per-signature"
                value={String(imposition.sheetsPerSignature)}
                onChange={(e) =>
                  onImposition?.({ ...imposition, sheetsPerSignature: Number(e.target.value) })
                }
              >
                {SHEETS_PER_SIGNATURE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="duplex-flip">Duplex flip</label>
              <select
                id="duplex-flip"
                value={imposition.flip}
                onChange={(e) =>
                  onImposition?.({
                    ...imposition,
                    flip: e.target.value as ImpositionOptions["flip"],
                  })
                }
              >
                <option value="long-edge">{FLIP_LABELS["long-edge"]}</option>
                <option value="short-edge">{FLIP_LABELS["short-edge"]}</option>
              </select>
            </div>
          </fieldset>
        </details>
      </div>

      <fieldset className="panel__group">
        <legend>Page size</legend>
        <div className="field">
          <label htmlFor="page-size">Page size</label>
          <select
            id="page-size"
            value={pageSizeValue}
            onChange={(e) => onPageSize(e.target.value)}
          >
            {TRIM_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM}>Custom size</option>
          </select>
        </div>

        {customMode && (
          <div className="field-row">
            <NumberField
              id="trim-w"
              label="Width"
              unit={unit}
              value={design.trim.w}
              min={1}
              step={unit === "mm" ? 1 : 0.1}
              onCommit={(v) => onChange(applyCustomDimension(design, "w", v))}
            />
            <NumberField
              id="trim-h"
              label="Height"
              unit={unit}
              value={design.trim.h}
              min={1}
              step={unit === "mm" ? 1 : 0.1}
              onCommit={(v) => onChange(applyCustomDimension(design, "h", v))}
            />
            <div className="field">
              <label htmlFor="trim-unit">Units</label>
              <select
                id="trim-unit"
                value={unit}
                onChange={(e) => onChange(applyTrimUnit(design, e.target.value as Unit))}
              >
                <option value="in">in</option>
                <option value="mm">mm</option>
              </select>
            </div>
          </div>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="font">Font</label>
        <select
          id="font"
          value={design.font.family}
          onFocus={onFontFocus}
          onChange={(e) => onChange(applyFontFamily(design, e.target.value))}
        >
          {FONT_CATALOG.map((f) => (
            <option key={f.id} value={f.stack}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <NumberField
          id="font-size"
          label="Font size"
          unit="pt"
          value={design.font.sizePt}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={FONT_SIZE_STEP}
          onCommit={(v) => onChange(applyFontSize(design, v))}
        />
        <NumberField
          id="line-spacing"
          label="Line spacing"
          value={spacingValue}
          min={LINE_SPACING_MIN}
          max={LINE_SPACING_MAX}
          step={LINE_SPACING_STEP}
          onCommit={(v) => onChange(applyLineSpacing(design, v))}
        />
      </div>

      <fieldset className="panel__group">
        <legend>Margins</legend>
        <div className="field-row">
          <NumberField
            id="margin-inner"
            label="Inner"
            unit={unit}
            value={design.margins.inner}
            min={marginMin}
            step={marginStep}
            onCommit={(v) => onChange(applyMargin(design, "inner", v))}
          />
          <NumberField
            id="margin-outer"
            label="Outer"
            unit={unit}
            value={design.margins.outer}
            min={marginMin}
            step={marginStep}
            onCommit={(v) => onChange(applyMargin(design, "outer", v))}
          />
          <NumberField
            id="margin-top"
            label="Top"
            unit={unit}
            value={design.margins.top}
            min={marginMin}
            step={marginStep}
            onCommit={(v) => onChange(applyMargin(design, "top", v))}
          />
          <NumberField
            id="margin-bottom"
            label="Bottom"
            unit={unit}
            value={design.margins.bottom}
            min={marginMin}
            step={marginStep}
            onCommit={(v) => onChange(applyMargin(design, "bottom", v))}
          />
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="chapter-drop">Chapter opening</label>
        <select
          id="chapter-drop"
          value={String(design.chapterOpening.topDropPt)}
          onChange={(e) => onChange(applyChapterDrop(design, Number(e.target.value)))}
        >
          {CHAPTER_DROPS.slice()
            .reverse()
            .map((d) => (
              <option key={d} value={d}>
                {DROP_LABELS[d]}
              </option>
            ))}
        </select>
      </div>

      <Toggle
        id="start-recto"
        label="Open chapters on the right"
        checked={design.chapterOpening.startRecto}
        onChange={(v) => onChange(applyStartRecto(design, v))}
      />

      <fieldset className="panel__group">
        <legend>Running headers</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="header-verso">Left page</label>
            <select
              id="header-verso"
              value={design.runningHeader.verso}
              onChange={(e) => onChange(applyHeader(design, "verso", e.target.value))}
            >
              {HEADER_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="header-recto">Right page</label>
            <select
              id="header-recto"
              value={design.runningHeader.recto}
              onChange={(e) => onChange(applyHeader(design, "recto", e.target.value))}
            >
              {HEADER_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <Toggle
        id="widow-control"
        label="Widow and orphan control"
        checked={design.widowControl}
        onChange={(v) => onChange(applyWidowControl(design, v))}
      />
      <Toggle
        id="hyphenation"
        label="Hyphenation"
        checked={design.hyphenation}
        onChange={(v) => onChange(applyHyphenation(design, v))}
      />

      <button type="button" className="btn btn--ghost panel__reset" onClick={onReset}>
        Reset to defaults
      </button>
    </section>
  );
}

/**
 * A native number input whose text is free to type into while focused; on each
 * valid value it commits the clamped design, and on blur it snaps back to the
 * committed value. This keeps typing fluid without a controlled-input fight.
 */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit ? <span className="field__unit"> ({unit})</span> : null}
      </label>
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

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="field field--toggle">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}
