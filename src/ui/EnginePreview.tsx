import { useEffect, useRef, useState } from "react";
import type { Document } from "../model/document";
import type { Page, PaginationResult, Timings } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { EngineClient, type EngineClientLike } from "../engine/client";
import { FIRST_PAGES } from "../engine/engine";
import { SOFT_HYPHEN } from "../engine/lineBreak";

// Throwaway validation surface. It proves the engine runs end to end: page
// count, a timing readout, and the first few laid-out pages. It is bounded
// (never renders the whole book) and is replaced whole by the real facing-page
// preview in a later EPIC. Not the product's typeset preview.

type PreviewState =
  | { status: "laying-out" }
  | { status: "progress"; estimate: number; pages: Page[] }
  | { status: "done"; result: PaginationResult; timings: Timings }
  | { status: "error" };

interface Props {
  document: Document;
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

export function EnginePreview({ document, createEngine = defaultCreateEngine }: Props) {
  const [state, setState] = useState<PreviewState>({ status: "laying-out" });
  const createRef = useRef(createEngine);

  useEffect(() => {
    setState({ status: "laying-out" });
    const engine = createRef.current();
    if (!engine) return;
    engine.load(document);
    engine.paginate(DEFAULT_DESIGN, {
      onProgress: (estimate, firstPages) => setState({ status: "progress", estimate, pages: firstPages }),
      onDone: (result, timings) => setState({ status: "done", result, timings }),
      onError: () => setState({ status: "error" }),
    });
    return () => engine.dispose();
  }, [document]);

  if (state.status === "error") {
    return (
      <section className="preview" aria-label="Book layout">
        <div className="surface__panel surface__panel--error preview__panel" role="alert">
          <h2 className="preview__heading">Run the layout again</h2>
          <p className="surface__body">
            The layout stopped before it finished. Reload the book to try again.
          </p>
        </div>
      </section>
    );
  }

  if (state.status === "laying-out") {
    return (
      <section className="preview" aria-label="Book layout" aria-busy="true">
        <h2 className="preview__heading">Laying out your book</h2>
        <div className="preview__pages" aria-hidden="true">
          <div className="preview__page preview__page--skeleton" />
          <div className="preview__page preview__page--skeleton" />
        </div>
      </section>
    );
  }

  const pages =
    state.status === "progress" ? state.pages : state.result.pages.slice(0, FIRST_PAGES);
  const heading =
    state.status === "progress"
      ? `About ${state.estimate} ${plural(state.estimate)}`
      : `${state.result.pageCount} ${plural(state.result.pageCount)}`;

  return (
    <section className="preview" aria-label="Book layout" aria-busy={state.status === "progress"}>
      <div className="preview__top">
        <h2 className="preview__heading">{heading}</h2>
        {state.status === "done" && (
          <p className="preview__timing">
            First view {Math.round(state.timings.firstFeedbackMs)} ms, settled{" "}
            {Math.round(state.timings.settleMs)} ms
          </p>
        )}
      </div>
      <div className="preview__pages">
        {pages.slice(0, FIRST_PAGES).map((page) => (
          <PagePreview key={page.index} page={page} />
        ))}
      </div>
    </section>
  );
}

function PagePreview({ page }: { page: Page }) {
  return (
    <div className="preview__page" data-kind={page.kind} data-testid="preview-page">
      {page.lines.map((line, i) => (
        <div key={i} className="preview__line">
          {displayText(line.text, line.hyphenated)}
        </div>
      ))}
    </div>
  );
}

/** Show an inserted soft hyphen as a visible hyphen at the line end. */
function displayText(text: string, hyphenated: boolean): string {
  const bare = text.split(SOFT_HYPHEN).join("");
  return hyphenated ? `${bare}-` : bare;
}

function plural(n: number): string {
  return n === 1 ? "page" : "pages";
}
