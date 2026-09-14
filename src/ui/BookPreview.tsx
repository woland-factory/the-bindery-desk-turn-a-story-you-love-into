import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Document } from "../model/document";
import type { Page, PaginationResult } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { EngineClient, type EngineClientLike } from "../engine/client";
import { pagePlacement } from "./pageGeometry";
import { groupSpreads, type ViewMode } from "./spreads";
import { windowSpreads } from "./bookScroller";
import { Spread } from "./Spread";

// The product's typeset surface. It consumes the engine's PaginationResult
// read-only and paints a real, book-shaped, virtualized view: geometry for the
// whole book, only the visible spreads in the DOM. It renders DEFAULT_DESIGN
// only (controls arrive in a later EPIC) and replaces the throwaway
// EnginePreview end to end.

// Single below this width, facing spread at or above it, so both leaves stay
// readable in spread mode.
const BREAKPOINT_PX = 820;
const MAX_SCALE = 1.1;
const MIN_SCALE = 0.1;
const OVERSCAN = 2;
const ROW_GAP_PX = 24;
const GUTTER_PX = 16;
const H_PAD_PX = 16;
// Used before the viewport reports its real size (e.g. in jsdom).
const FALLBACK_WIDTH = 800;
const FALLBACK_HEIGHT = 640;

type PreviewState =
  | { status: "laying-out" }
  | { status: "first-spread"; pages: Page[] }
  | { status: "ready"; result: PaginationResult }
  | { status: "empty" }
  | { status: "error" };

interface Props {
  document: Document;
  onReset: () => void;
  /** Injectable for tests; defaults to a real worker-backed client. */
  createEngine?: () => EngineClientLike | null;
}

function defaultCreateEngine(): EngineClientLike | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new EngineClient();
  } catch {
    return null;
  }
}

export function BookPreview({ document, onReset, createEngine = defaultCreateEngine }: Props) {
  const [state, setState] = useState<PreviewState>({ status: "laying-out" });
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const createRef = useRef(createEngine);
  const rafRef = useRef<number | null>(null);

  const { width, height } = useViewportSize(viewportRef);
  const availWidth = (width || FALLBACK_WIDTH) - 2 * H_PAD_PX;
  const availHeight = height || FALLBACK_HEIGHT;
  const mode: ViewMode = (width || FALLBACK_WIDTH) >= BREAKPOINT_PX ? "spread" : "single";

  const leaf = pagePlacement(DEFAULT_DESIGN, "recto");
  const scale = fitScale(mode, availWidth, leaf.pageWidthPx);
  const stridePx = leaf.pageHeightPx * scale + ROW_GAP_PX;

  useEffect(() => {
    setState({ status: "laying-out" });
    setScrollTop(0);
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    const engine = createRef.current();
    if (!engine) return;
    engine.load(document);
    engine.paginate(DEFAULT_DESIGN, {
      onProgress: (_estimate, firstPages) =>
        setState((prev) => (prev.status === "ready" ? prev : { status: "first-spread", pages: firstPages })),
      onDone: (result) =>
        setState(result.pageCount === 0 ? { status: "empty" } : { status: "ready", result }),
      onError: () => setState({ status: "error" }),
    });
    return () => engine.dispose();
  }, [document]);

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
  const visible = spreads.slice(win.firstSpread, win.lastSpread + 1);
  const pageCount = state.status === "ready" ? state.result.pageCount : 0;

  return (
    <section className="preview" aria-label="Book layout">
      <p className="preview__count" aria-live="polite">
        {state.status === "ready" ? countLabel(pageCount) : " "}
      </p>
      <div
        ref={viewportRef}
        className="book"
        role="region"
        aria-label="Book preview"
        aria-busy={layingOut}
        tabIndex={0}
        onScroll={onScroll}
      >
        {layingOut ? (
          <SkeletonSpread scale={scale} mode={mode} />
        ) : (
          <div className="book__spacer" style={{ height: win.totalPx }}>
            <div className="book__window" style={{ transform: `translateY(${win.topPadPx}px)` }}>
              {visible.map((row, i) => (
                <Spread
                  key={win.firstSpread + i}
                  row={row}
                  design={DEFAULT_DESIGN}
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
function SkeletonSpread({ scale, mode }: { scale: number; mode: ViewMode }) {
  const leaf = pagePlacement(DEFAULT_DESIGN, "recto");
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
