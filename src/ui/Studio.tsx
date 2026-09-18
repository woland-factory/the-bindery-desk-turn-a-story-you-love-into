import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "../model/document";
import type { ImportReport } from "../model/importReport";
import type { DesignSpec } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import type { EngineClientLike } from "../engine/client";
import {
  ladderCandidates,
  predictPages,
  sheetsForPages,
  type BudgetBounds,
  type SolveOutcome,
} from "../engine/budget";
import { warmCatalog } from "../fonts/loadFonts";
import { ControlPanel } from "./ControlPanel";
import {
  BookPreview,
  type BudgetRequest,
  type ExportUiState,
  type SettledPass,
} from "./BookPreview";
import { StructureView } from "./StructureView";
import { loadDesign, saveDesign } from "./design/persistDesign";
import { BudgetSlider, type Readout } from "./budget/BudgetSlider";
import { loadBounds, saveBounds } from "./budget/persistBudget";
import type { ImpositionOptions } from "../export/impose";
import { loadImposition, saveImposition } from "../export/persistPrint";

// The studio owns the working design: it restores the persisted design on
// mount, feeds it live to the preview, persists every change (debounced), and
// warms the curated faces off the critical path. The paper-budget slider sits
// at the top of the control column; its solver outcomes become the working
// design, while `budgetBase` snapshots the last MANUAL design so repeated
// solves scale margins from the binder's own numbers, never compounding.

interface Props {
  document: Document;
  report: ImportReport;
  /** App-level reset (open another book). Distinct from resetting the design. */
  onReset: () => void;
  /** Injectable for tests; forwarded to the preview. */
  createEngine?: () => EngineClientLike | null;
}

const SAVE_DEBOUNCE_MS = 250;

export function Studio({ document, report, onReset, createEngine }: Props) {
  const [design, setDesign] = useState<DesignSpec>(() => loadDesign());
  const [bounds, setBounds] = useState(() => loadBounds());
  // The design as of the last manual change (dial edit, Reset, initial load).
  // Solver outcomes never move it, so margin percentages stay anchored to the
  // binder's own margins across repeated solves.
  const [budgetBase, setBudgetBase] = useState<DesignSpec>(design);
  const [settled, setSettled] = useState<SettledPass | null>(null);
  const [budgetRequest, setBudgetRequest] = useState<BudgetRequest | null>(null);
  const [outcome, setOutcome] = useState<SolveOutcome | null>(null);
  const [solving, setSolving] = useState(false);
  // The thumb's live value while a drag's solve is still in flight.
  const [target, setTarget] = useState<number | null>(null);
  // Print setup drives imposition only; it never touches the design or solves.
  const [imposition, setImposition] = useState<ImpositionOptions>(() => loadImposition());
  const [exportSeq, setExportSeq] = useState(0);
  const [exportState, setExportState] = useState<ExportUiState>({ kind: "idle" });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const persist = useCallback((next: DesignSpec) => {
    if (saveTimer.current != null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDesign(next), SAVE_DEBOUNCE_MS);
  }, []);

  const clearSolveDisplay = useCallback(() => {
    setBudgetRequest(null);
    setOutcome(null);
    setSolving(false);
    setTarget(null);
  }, []);

  const onChange = useCallback(
    (next: DesignSpec) => {
      setDesign(next);
      persist(next);
      // A manual dial change takes over: it becomes the new solve base and
      // any in-flight solve is superseded by the re-paginate it triggers.
      setBudgetBase(next);
      clearSolveDisplay();
    },
    [persist, clearSolveDisplay],
  );

  const onResetDesign = useCallback(() => {
    // Cancel any pending debounced save from a recent dial change; otherwise it
    // fires after this reset and overwrites localStorage with the pre-reset
    // design, so a reload would restore the old dials instead of the defaults.
    if (saveTimer.current != null) clearTimeout(saveTimer.current);
    setDesign(DEFAULT_DESIGN);
    saveDesign(DEFAULT_DESIGN);
    setBudgetBase(DEFAULT_DESIGN);
    clearSolveDisplay();
  }, [clearSolveDisplay]);

  const onTarget = useCallback(
    (sheets: number) => {
      setTarget(sheets);
      setSolving(true);
      setOutcome(null);
      seqRef.current += 1;
      setBudgetRequest({ target: sheets, base: budgetBase, bounds, seq: seqRef.current });
    },
    [budgetBase, bounds],
  );

  const onSolveOutcome = useCallback(
    (next: SolveOutcome) => {
      // The winner design object flows through unchanged, so the preview
      // recognizes it as already laid out and the dials move to match it.
      setDesign(next.design);
      persist(next.design);
      setOutcome(next);
      setSolving(false);
      setTarget(null);
    },
    [persist],
  );

  const onSettled = useCallback((pass: SettledPass) => {
    setSettled(pass);
  }, []);

  const onBounds = useCallback((next: BudgetBounds) => {
    // Already clamped by the slider surface; persist and re-derive the range.
    // Bounds never touch the design or trigger a solve by themselves.
    setBounds(next);
    saveBounds(next);
  }, []);

  const onExport = useCallback(() => {
    // A fresh seq drives one export; the preview reads the settled result.
    setExportSeq((seq) => seq + 1);
  }, []);

  const onExportState = useCallback((next: ExportUiState) => {
    setExportState(next);
  }, []);

  const onImposition = useCallback((next: ImpositionOptions) => {
    // Print setup edits change the imposition only. No design change, no solve.
    setImposition(next);
    saveImposition(next);
  }, []);

  const warmFonts = useCallback(() => {
    void warmCatalog();
  }, []);

  // Warm the curated faces after first paint, off the initial paginate's path.
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (typeof idle === "function") {
      idle(warmFonts);
      return;
    }
    const t = setTimeout(warmFonts, 0);
    return () => clearTimeout(t);
  }, [warmFonts]);

  useEffect(
    () => () => {
      if (saveTimer.current != null) clearTimeout(saveTimer.current);
    },
    [],
  );

  const settledSheets = settled ? sheetsForPages(settled.pageCount) : null;

  // The ladder is rebuilt only when its inputs move, not on every settle.
  const ladderEnds = useMemo(() => {
    const candidates = ladderCandidates(budgetBase, bounds);
    return { dense: candidates[0], roomy: candidates[candidates.length - 1] };
  }, [budgetBase, bounds]);

  // Drag range: predicted sheets at the ladder's ends, widened to include the
  // current settled count. Endpoints are estimates for the drag range only;
  // outcomes stay exact through the solver's clamped reports.
  const range = useMemo(() => {
    if (!settled || settledSheets == null) return { min: 1, max: 1 };
    const dense = sheetsForPages(predictPages(settled, ladderEnds.dense));
    const roomy = sheetsForPages(predictPages(settled, ladderEnds.roomy));
    return {
      min: Math.max(1, Math.min(dense, settledSheets)),
      max: Math.max(roomy, settledSheets),
    };
  }, [settled, settledSheets, ladderEnds]);

  let readout: Readout;
  if (!settled || settledSheets == null) readout = { kind: "waiting" };
  else if (solving) readout = { kind: "solving" };
  else if (outcome && outcome.achieved === "closest") readout = { kind: "closest", sheets: outcome.sheets };
  else if (outcome && outcome.achieved === "clamped-dense")
    readout = { kind: "clamped-dense", sheets: outcome.sheets };
  else if (outcome && outcome.achieved === "clamped-roomy")
    readout = { kind: "clamped-roomy", sheets: outcome.sheets };
  else readout = { kind: "settled", sheets: settledSheets };

  const sliderValue = target ?? settledSheets ?? range.min;

  return (
    <div className="studio">
      <div className="studio__work">
        <div className="studio__controls">
          <BudgetSlider
            min={range.min}
            max={range.max}
            value={sliderValue}
            disabled={!settled}
            solving={solving}
            readout={readout}
            bounds={bounds}
            onTarget={onTarget}
            onBounds={onBounds}
          />
          <ControlPanel
            design={design}
            onChange={onChange}
            onReset={onResetDesign}
            onFontFocus={warmFonts}
            canExport={settled != null}
            exportState={exportState}
            onExport={onExport}
            imposition={imposition}
            onImposition={onImposition}
          />
        </div>
        <BookPreview
          document={document}
          design={design}
          onReset={onReset}
          budget={budgetRequest}
          onSolveOutcome={onSolveOutcome}
          onSettled={onSettled}
          exportRequest={exportSeq > 0 ? { seq: exportSeq, imposition } : null}
          onExportState={onExportState}
          createEngine={createEngine}
        />
      </div>
      <StructureView document={document} report={report} onReset={onReset} />
    </div>
  );
}
