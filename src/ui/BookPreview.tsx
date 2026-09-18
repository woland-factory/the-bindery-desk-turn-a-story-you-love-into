import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Document } from "../model/document";
import type { DesignSpec, Page, PaginationResult } from "../engine/types";
import { EngineClient, type EngineClientLike, type PaginateHandlers } from "../engine/client";
import { statsForResult, type BudgetBounds, type PassStats, type SolveOutcome } from "../engine/budget";
import { entryForStack } from "../fonts/catalog";
import { ExportClient, type ExportClientLike } from "../export/client";
import type { ImpositionOptions } from "../export/impose";
import type { DocMeta, ExportPhase } from "../export/protocol";
import { filenameSlug, pdfObjectUrl, triggerDownload } from "../export/download";
import { affectsPagination } from "./design/designPatch";
import { pagePlacement } from "./pageGeometry";
import { groupSpreads, type ViewMode } from "./spreads";
import { windowSpreads } from "./bookScroller";
import { Spread } from "./Spread";

// The product's typeset surface. It consumes the engine's PaginationResult
// read-only and paints a real, book-shaped, virtualized view: geometry for the
// whole book, only the visible spreads in the DOM. The live design arrives as a
// prop; the engine stays alive across design changes and re-paginates on change
// without blanking or resetting scroll. Each mounted page is drawn with the
// design that produced it, so a re-flow never shows a half-applied layout.

// Single below this width, facing spread at or above it, so both leaves stay
// readable in spread mode.
const BREAKPOINT_PX = 820;
const MAX_SCALE = 1.1;
const MIN_SCALE = 0.1;
const OVERSCAN = 2;
const ROW_GAP_PX = 24;
const GUTTER_PX = 16;
const H_PAD_PX = 16;
// Coalesce a stream of dial changes into one paginate per frame.
const REFLOW_DEBOUNCE_MS = 16;
// Last resort when neither the container nor the viewport width can be read
// (e.g. in jsdom, where clientWidth is 0). In a real browser we prefer the
// live viewport width so the pre-measurement skeleton is never sized for a
// wider screen than the phone actually has.
const FALLBACK_WIDTH = 800;
const FALLBACK_HEIGHT = 640;

type PreviewState =
  | { status: "laying-out" }
  | { status: "first-spread"; pages: Page[]; design: DesignSpec }
  | { status: "ready"; result: PaginationResult; design: DesignSpec; reflowing: boolean }
  | { status: "empty" }
  | { status: "error" };

/** One committed slider target; a bumped `seq` requests a fresh solve. */
export interface BudgetRequest {
  target: number;
  base: DesignSpec;
  bounds: BudgetBounds;
  seq: number;
}

/** One committed Export click; a bumped `seq` requests a fresh export. */
export interface ExportRequest {
  seq: number;
  imposition: ImpositionOptions;
}

/** A saved file the user can re-download from the status area. */
export interface ExportDownload {
  url: string;
  filename: string;
  label: string;
}

/** What the studio shows for the Export button and status line. */
export type ExportUiState =
  | { kind: "idle" }
  | { kind: "running"; phase: ExportPhase; done: number; total: number }
  | { kind: "done"; downloads: ExportDownload[] }
  | { kind: "error" };

/** What the latest settled pass (paginate or solve) laid out. */
export interface SettledPass {
  design: DesignSpec;
  pageCount: number;
  stats: PassStats;
}

interface Props {
  document: Document;
  design: DesignSpec;
  onReset: () => void;
  /** The pending paper-budget request, or null when no solve is asked for. */
  budget?: BudgetRequest | null;
  /** Fired with the solver's report; its `design` becomes the working design. */
  onSolveOutcome?: (outcome: SolveOutcome) => void;
  /** Fired on every settled pass, paginate or solve. */
  onSettled?: (settled: SettledPass) => void;
  /** The pending Export request, or null when no export is asked for. */
  exportRequest?: ExportRequest | null;
  /** Fired as the export progresses, completes, or fails. */
  onExportState?: (state: ExportUiState) => void;
  /** Injectable for tests; defaults to a real worker-backed client. */
  createEngine?: () => EngineClientLike | null;
  /** Injectable for tests; defaults to a real export worker client. */
  createExport?: () => ExportClientLike | null;
}

function defaultCreateEngine(): EngineClientLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new EngineClient();
  } catch {
    return null;
  }
}

function defaultCreateExport(): ExportClientLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new ExportClient();
  } catch {
    return null;
  }
}

/** Revoke a Blob object URL where the browser supports it (jsdom does not). */
function revokeObjectUrl(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

/** The few book-data strings the PDF's running heads need. No body text. */
function buildDocMeta(doc: Document): DocMeta {
  const chapterTitles: Record<number, string> = {};
  for (const chapter of doc.chapters) chapterTitles[chapter.order] = chapter.title;
  return { title: doc.title, author: doc.author, chapterTitles };
}

export function BookPreview({
  document,
  design,
  onReset,
  budget = null,
  onSolveOutcome,
  onSettled,
  exportRequest = null,
  onExportState,
  createEngine = defaultCreateEngine,
  createExport = defaultCreateExport,
}: Props) {
  const [state, setState] = useState<PreviewState>({ status: "laying-out" });
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const createRef = useRef(createEngine);
  const engineRef = useRef<EngineClientLike | null>(null);
  const createExportRef = useRef(createExport);
  const exportClientRef = useRef<ExportClientLike | null>(null);
  // Object URLs held for the visible download links; revoked on the next export
  // and on unmount so a run never leaks blobs.
  const downloadUrlsRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);
  // The design of the currently mounted (or in-flight) result. `null` until the
  // first pass starts, which lets the design-change effect skip the initial
  // render (the engine effect already kicks that off).
  const committedRef = useRef<DesignSpec | null>(null);
  // A scroll fraction to restore after a result swap changes the page count.
  const anchorRef = useRef<number | null>(null);

  // Design the mounted surface is drawn with. During a re-flow this stays the
  // old design until `done` swaps in the new result, so no page renders with a
  // half-applied layout. Before the first result it is the live prop.
  const renderDesign = "design" in state ? state.design : design;
  const { width, height } = useViewportSize(viewportRef);
  // Before the ResizeObserver reports the container's real size, fall back to
  // the live viewport width (mobile-safe) rather than a fixed desktop-ish
  // width, and cap the measured width by the viewport too. Either way the
  // skeleton spread can never be scaled wider than the screen, so it can't
  // inflate the grid track past the viewport and flash a horizontal scrollbar
  // on a phone. `document` here is the book prop, so read the DOM off `window`.
  const viewportWidth =
    typeof window !== "undefined" ? window.document.documentElement.clientWidth : 0;
  const fallbackWidth = viewportWidth > 0 ? viewportWidth : FALLBACK_WIDTH;
  let effectiveWidth = width || fallbackWidth;
  if (viewportWidth > 0) effectiveWidth = Math.min(effectiveWidth, viewportWidth);
  const availWidth = effectiveWidth - 2 * H_PAD_PX;
  const availHeight = height || FALLBACK_HEIGHT;
  const mode: ViewMode = effectiveWidth >= BREAKPOINT_PX ? "spread" : "single";

  const leaf = pagePlacement(renderDesign, "recto");
  const scale = fitScale(mode, availWidth, leaf.pageWidthPx);
  const stridePx = leaf.pageHeightPx * scale + ROW_GAP_PX;

  // Latest callbacks without re-keying the engine effects on their identity.
  const onSolveOutcomeRef = useRef(onSolveOutcome);
  onSolveOutcomeRef.current = onSolveOutcome;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const onExportStateRef = useRef(onExportState);
  onExportStateRef.current = onExportState;

  // One handler set for paginate and solve, so a solve's result flows through
  // the exact same progress/done path: mounted book kept during the pass,
  // scroll anchored across the swap, empty and error states unchanged.
  // `target` is the design being laid out (a solve's winner overrides it).
  const handlersFor = useCallback((target: DesignSpec): PaginateHandlers => {
    return {
      onProgress: (_estimate, firstPages) =>
        setState((prev) =>
          // Keep a settled book mounted during a re-flow; only paint the first
          // spread when there is nothing yet.
          prev.status === "ready" ? prev : { status: "first-spread", pages: firstPages, design: target },
        ),
      onDone: (result, _timings, stats, solve) => {
        const applied = solve ? solve.design : target;
        if (solve) {
          // Pre-commit the winner so Studio's setDesign(solve.design) is seen
          // as already-paginated (object identity), never re-paginated.
          committedRef.current = applied;
        }
        if (result.pageCount === 0) {
          setState({ status: "empty" });
          return;
        }
        const el = viewportRef.current;
        if (el) {
          const max = Math.max(0, el.scrollHeight - el.clientHeight);
          anchorRef.current = max > 0 ? el.scrollTop / max : 0;
        }
        setState({ status: "ready", result, design: applied, reflowing: false });
        onSettledRef.current?.({
          design: applied,
          pageCount: result.pageCount,
          stats: stats ?? statsForResult(result),
        });
        if (solve) onSolveOutcomeRef.current?.(solve);
      },
      onError: () => setState({ status: "error" }),
    };
  }, []);

  const startPaginate = useCallback(
    (engine: EngineClientLike, target: DesignSpec) => {
      // Pre-warm a curated face in the worker; the system serif is embeddable:
      // false, so the default path posts nothing and stays untouched.
      const entry = entryForStack(target.font.family);
      if (entry?.embeddable) engine.warmFonts?.([entry.id]);

      engine.paginate(target, handlersFor(target));
    },
    [handlersFor],
  );

  // Engine lifecycle: keyed on the document only, so a design change never
  // recreates the engine. Creates it, loads the book once, kicks off the first
  // pass, and disposes on unmount / document change.
  useEffect(() => {
    setState({ status: "laying-out" });
    setScrollTop(0);
    anchorRef.current = null;
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    const engine = createRef.current();
    engineRef.current = engine;
    committedRef.current = design;
    if (!engine) return;
    engine.load(document);
    startPaginate(engine, design);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // `design` is intentionally omitted: the initial design is captured above,
    // and later design changes are handled by the effect below without a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, startPaginate]);

  // Design changes after the first pass: re-paginate engine-affecting changes
  // without blanking, or re-render header-only changes in place.
  useEffect(() => {
    const engine = engineRef.current;
    const prev = committedRef.current;
    if (!engine || prev === null || prev === design) return;

    const affects = affectsPagination(prev, design);
    committedRef.current = design;

    if (!affects) {
      // Header-only: commit the new design in place, no paginate.
      setState((s) =>
        s.status === "ready" || s.status === "first-spread" ? { ...s, design } : s,
      );
      return;
    }

    setState((s) => (s.status === "ready" ? { ...s, reflowing: true } : s));
    const timer = setTimeout(() => startPaginate(engine, design), REFLOW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [design, startPaginate]);

  // A committed slider target: run the solve through the same debounce and
  // re-flow affordance as a dial change. Keyed on the request's seq so a drag
  // stream coalesces here and supersedes itself in the client and worker.
  const budgetSeq = budget?.seq;
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.solve || budget == null) return;
    setState((s) => (s.status === "ready" ? { ...s, reflowing: true } : s));
    const timer = setTimeout(
      () =>
        engine.solve?.(
          { targetSheets: budget.target, base: budget.base, bounds: budget.bounds },
          handlersFor(budget.base),
        ),
      REFLOW_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
    // `budget` changes identity only when seq bumps; handlersFor is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetSeq, handlersFor]);

  // A committed Export click: build both PDFs in the export worker from the
  // settled result read-only, stream progress to the studio, and save both
  // files on done. Keyed on the request's seq so a later click supersedes an
  // in-flight export (latest-wins in the client). Export never mutates preview
  // state, never re-paginates, and never blanks the mounted book.
  const exportSeq = exportRequest?.seq;
  const exportImposition = exportRequest?.imposition;
  useEffect(() => {
    if (exportSeq == null || exportImposition == null) return;
    if (state.status !== "ready") return;
    let client = exportClientRef.current;
    if (!client) {
      client = createExportRef.current();
      exportClientRef.current = client;
    }
    if (!client) return;

    const { result, design: appliedDesign } = state;
    const docMeta = buildDocMeta(document);
    onExportStateRef.current?.({ kind: "running", phase: "typeset", done: 0, total: result.pageCount });

    client.export(
      { result, design: appliedDesign, docMeta, imposition: exportImposition },
      {
        onProgress: (phase, done, total) =>
          onExportStateRef.current?.({ kind: "running", phase, done, total }),
        onDone: (typeset, signatures) => {
          for (const url of downloadUrlsRef.current) revokeObjectUrl(url);
          const slug = document.title;
          const files: ExportDownload[] = [
            { url: pdfObjectUrl(typeset), filename: filenameSlug(slug, "typeset"), label: "Save typeset PDF" },
            { url: pdfObjectUrl(signatures), filename: filenameSlug(slug, "signatures"), label: "Save signatures PDF" },
          ];
          downloadUrlsRef.current = files.map((f) => f.url);
          // A short tick between saves so the browser does not suppress the second.
          files.forEach((f, i) => setTimeout(() => triggerDownload(f.url, f.filename), i * 150));
          onExportStateRef.current?.({ kind: "done", downloads: files });
        },
        onError: () => onExportStateRef.current?.({ kind: "error" }),
      },
    );
    // Only the request's seq drives a fresh export; state is read at click time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSeq]);

  // Dispose the export worker and revoke any held URLs on unmount.
  useEffect(
    () => () => {
      exportClientRef.current?.dispose();
      exportClientRef.current = null;
      for (const url of downloadUrlsRef.current) revokeObjectUrl(url);
      downloadUrlsRef.current = [];
    },
    [],
  );

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = viewportRef.current;
      if (el) setScrollTop(el.scrollTop);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const pages = useMemo<Page[]>(() => {
    if (state.status === "first-spread") return state.pages;
    if (state.status === "ready") return state.result.pages;
    return [];
  }, [state]);

  const spreads = useMemo(() => groupSpreads(pages, mode), [pages, mode]);
  const win = windowSpreads(spreads.length, stridePx, scrollTop, availHeight, OVERSCAN);

  // Restore the captured scroll fraction after a result swap re-sizes the book.
  useLayoutEffect(() => {
    const frac = anchorRef.current;
    if (frac == null) return;
    anchorRef.current = null;
    const el = viewportRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const top = frac * max;
    el.scrollTop = top;
    setScrollTop(top);
  }, [state]);

  if (state.status === "error") {
    return (
      <StatePanel
        role="alert"
        heading="Show the book again"
        body="The layout stopped before it finished. Open the book again to try."
        action="Open another book"
        onAction={onReset}
      />
    );
  }

  if (state.status === "empty") {
    return (
      <StatePanel
        heading="This file has only front matter."
        body="Open another book to see it laid out in facing pages."
        action="Open another book"
        onAction={onReset}
      />
    );
  }

  const layingOut = state.status === "laying-out";
  const reflowing = state.status === "ready" && state.reflowing;
  const visible = spreads.slice(win.firstSpread, win.lastSpread + 1);
  const pageCount = state.status === "ready" ? state.result.pageCount : 0;

  return (
    <section className="preview" aria-label="Book layout">
      <p className="preview__count" aria-live="polite">
        {state.status === "ready" ? countLabel(pageCount) : " "}
      </p>
      {reflowing && (
        <span className="preview__reflow" aria-hidden="true">
          Reflowing
        </span>
      )}
      <div
        ref={viewportRef}
        className="book"
        role="region"
        aria-label="Book preview"
        aria-busy={layingOut || reflowing}
        tabIndex={0}
        onScroll={onScroll}
      >
        {layingOut ? (
          <SkeletonSpread design={renderDesign} scale={scale} mode={mode} />
        ) : (
          <div className="book__spacer" style={{ height: win.totalPx }}>
            <div className="book__window" style={{ transform: `translateY(${win.topPadPx}px)` }}>
              {visible.map((row, i) => (
                <Spread
                  key={win.firstSpread + i}
                  row={row}
                  design={renderDesign}
                  doc={document}
                  scale={scale}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function fitScale(mode: ViewMode, availWidth: number, pageWidthPx: number): number {
  const usable = mode === "spread" ? (availWidth - GUTTER_PX) / 2 : availWidth;
  const raw = usable / pageWidthPx;
  if (!Number.isFinite(raw) || raw <= 0) return MIN_SCALE;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
}

function countLabel(n: number): string {
  return n === 1 ? "1 page" : `${n} pages`;
}

/** Measure a viewport element via ResizeObserver, falling back to window resize. */
function useViewportSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);
  return size;
}

/** A layout-stable skeleton at the dimensions the real spread will occupy. */
function SkeletonSpread({ design, scale, mode }: { design: DesignSpec; scale: number; mode: ViewMode }) {
  const leaf = pagePlacement(design, "recto");
  const style: CSSProperties = { width: leaf.pageWidthPx * scale, height: leaf.pageHeightPx * scale };
  const count = mode === "spread" ? 2 : 1;
  return (
    <div className="spread" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="leaf leaf--skeleton" style={style} />
      ))}
      <span className="visually-hidden">Laying out your book</span>
    </div>
  );
}

function StatePanel({
  role,
  heading,
  body,
  action,
  onAction,
}: {
  role?: "alert";
  heading: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <section className="preview" aria-label="Book layout">
      <div className="preview__state surface__panel" role={role}>
        <h2 className="preview__heading">{heading}</h2>
        <p className="surface__body">{body}</p>
        <button type="button" className="btn btn--primary" onClick={onAction}>
          {action}
        </button>
      </div>
    </section>
  );
}
