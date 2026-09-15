import { useCallback, useEffect, useRef, useState } from "react";
import type { Document } from "../model/document";
import type { ImportReport } from "../model/importReport";
import type { DesignSpec } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { warmCatalog } from "../fonts/loadFonts";
import { ControlPanel } from "./ControlPanel";
import { BookPreview } from "./BookPreview";
import { StructureView } from "./StructureView";
import { loadDesign, saveDesign } from "./design/persistDesign";

// The studio owns the working design: it restores the persisted design on
// mount, feeds it live to the preview, persists every change (debounced), and
// warms the curated faces off the critical path. It lays out the control panel
// beside the preview and keeps the honest parse view as a subordinate section.

interface Props {
  document: Document;
  report: ImportReport;
  /** App-level reset (open another book). Distinct from resetting the design. */
  onReset: () => void;
}

const SAVE_DEBOUNCE_MS = 250;

export function Studio({ document, report, onReset }: Props) {
  const [design, setDesign] = useState<DesignSpec>(() => loadDesign());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((next: DesignSpec) => {
    if (saveTimer.current != null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDesign(next), SAVE_DEBOUNCE_MS);
  }, []);

  const onChange = useCallback(
    (next: DesignSpec) => {
      setDesign(next);
      persist(next);
    },
    [persist],
  );

  const onResetDesign = useCallback(() => {
    // Cancel any pending debounced save from a recent dial change; otherwise it
    // fires after this reset and overwrites localStorage with the pre-reset
    // design, so a reload would restore the old dials instead of the defaults.
    if (saveTimer.current != null) clearTimeout(saveTimer.current);
    setDesign(DEFAULT_DESIGN);
    saveDesign(DEFAULT_DESIGN);
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

  return (
    <div className="studio">
      <div className="studio__work">
        <ControlPanel
          design={design}
          onChange={onChange}
          onReset={onResetDesign}
          onFontFocus={warmFonts}
        />
        <BookPreview document={document} design={design} onReset={onReset} />
      </div>
      <StructureView document={document} report={report} onReset={onReset} />
    </div>
  );
}
