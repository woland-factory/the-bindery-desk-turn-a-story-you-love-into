import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { BookPreview, type ExportUiState } from "./BookPreview";
import type { EngineClientLike, PaginateHandlers, SolveRequest } from "../engine/client";
import type { ExportClientLike, ExportHandlers, ExportInput } from "../export/client";
import { DEFAULT_IMPOSITION } from "../export/impose";
import type { Document } from "../model/document";
import type { DesignSpec, Page, PageKind, PageSide, PaginationResult, Timings } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { DEFAULT_BOUNDS, type PassStats, type SolveOutcome } from "../engine/budget";
import { applyFontSize, applyHeader } from "./design/designPatch";

vi.mock("../export/download", () => ({
  filenameSlug: (title: string, suffix: string) => `${title || "book"}-${suffix}.pdf`,
  pdfObjectUrl: () => "blob:mock",
  triggerDownload: vi.fn(),
}));
import { triggerDownload } from "../export/download";

function fakeExport() {
  let handlers: ExportHandlers | null = null;
  const inputs: ExportInput[] = [];
  const client: ExportClientLike = {
    export: (input, h) => {
      inputs.push(input);
      handlers = h;
    },
    dispose: vi.fn(),
  };
  return {
    create: () => client,
    inputs,
    dispose: client.dispose,
    progress: (phase: "typeset" | "impose", done: number, total: number) =>
      act(() => handlers?.onProgress?.(phase, done, total)),
    done: () => act(() => handlers?.onDone?.(new ArrayBuffer(8), new ArrayBuffer(4))),
    error: () => act(() => handlers?.onError?.("stopped")),
  };
}

const document: Document = {
  title: "Windermere",
  author: "A. Author",
  language: "en",
  chapters: [{ id: "c1", title: "Chapter One", order: 0, blocks: [] }],
  source: { name: "book", byteLength: 0 },
};

const timings: Timings = { wordCount: 10, pageCount: 1, firstFeedbackMs: 20, settleMs: 100 };

function page(index: number, texts: string[], kind: PageKind = "body"): Page {
  const side: PageSide = index % 2 === 0 ? "recto" : "verso";
  return {
    index,
    side,
    kind,
    chapterIndex: 0,
    lines: texts.map((text) => ({ text, x: 0, y: 0, width: 100, hyphenated: false })),
  };
}

function fakeEngine() {
  let handlers: PaginateHandlers | null = null;
  let paginateCalls = 0;
  const designs: DesignSpec[] = [];
  const warmedIds: string[][] = [];
  const solveRequests: SolveRequest[] = [];
  const engine: EngineClientLike = {
    load: vi.fn(),
    paginate: (design, h) => {
      paginateCalls++;
      designs.push(design);
      handlers = h;
    },
    solve: (request, h) => {
      solveRequests.push(request);
      handlers = h;
    },
    warmFonts: (ids) => warmedIds.push(ids),
    dispose: vi.fn(),
  };
  return {
    create: () => engine,
    get paginateCalls() {
      return paginateCalls;
    },
    get designs() {
      return designs;
    },
    get warmedIds() {
      return warmedIds;
    },
    get solveRequests() {
      return solveRequests;
    },
    progress: (pages: Page[]) => act(() => handlers?.onProgress?.(pages.length, pages, 40)),
    done: (result: PaginationResult, stats?: PassStats, solve?: SolveOutcome) =>
      act(() => handlers?.onDone?.(result, timings, stats, solve)),
    error: () => act(() => handlers?.onError?.("boom")),
    dispose: engine.dispose,
  };
}

async function scrollTo(el: HTMLElement, top: number) {
  Object.defineProperty(el, "scrollTop", { value: top, configurable: true });
  await act(async () => {
    fireEvent.scroll(el);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

/** Let the ~16ms re-flow debounce fire. */
async function settleReflow() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BookPreview state machine", () => {
  it("holds a layout-stable laying-out state before the engine responds", () => {
    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    expect(screen.getByText("Laying out your book")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Book preview" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("paints the first spread on progress", () => {
    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    f.progress([page(0, ["First line"], "opener")]);
    expect(screen.getByText("First line")).toBeInTheDocument();
  });

  it("swaps in the full book with a page-count label on done", () => {
    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    const pages = Array.from({ length: 500 }, (_, i) => page(i, ["a line"]));
    f.done({ pageCount: 500, pages });
    expect(screen.getByText("500 pages")).toBeInTheDocument();
  });

  it("shows the designed empty state for a zero-page book", async () => {
    const f = fakeEngine();
    const onReset = vi.fn();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={onReset} createEngine={f.create} />);
    f.done({ pageCount: 0, pages: [] });
    expect(
      screen.getByRole("heading", { name: "This file has only front matter." }),
    ).toBeInTheDocument();
    await act(async () => {
      screen.getByRole("button", { name: "Open another book" }).click();
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("shows the product-voice error state, not a crash", () => {
    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    f.error();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Show the book again");
    expect(alert).toHaveTextContent("The layout stopped before it finished.");
  });

  it("disposes the engine on unmount", () => {
    const f = fakeEngine();
    const { unmount } = render(
      <BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />,
    );
    unmount();
    expect(f.dispose).toHaveBeenCalled();
  });
});

describe("BookPreview live re-flow", () => {
  it("re-paginates on a design change without recreating the engine or blanking", async () => {
    const f = fakeEngine();
    const { rerender } = render(
      <BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />,
    );
    f.done({ pageCount: 4, pages: Array.from({ length: 4 }, (_, i) => page(i, ["a line"])) });
    expect(f.paginateCalls).toBe(1);

    const next = applyFontSize(DEFAULT_DESIGN, 14);
    rerender(<BookPreview document={document} design={next} onReset={() => {}} createEngine={f.create} />);
    await settleReflow();

    // Same engine (never disposed), a second paginate with the new design, and
    // the old book stays mounted with aria-busy set (never dropped to skeleton).
    expect(f.dispose).not.toHaveBeenCalled();
    expect(f.paginateCalls).toBe(2);
    expect(f.designs[1].font.sizePt).toBe(14);
    expect(screen.getAllByTestId("page-leaf").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Book preview" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Laying out your book")).not.toBeInTheDocument();

    f.done({ pageCount: 6, pages: Array.from({ length: 6 }, (_, i) => page(i, ["a line"])) });
    expect(screen.getByText("6 pages")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Book preview" })).toHaveAttribute("aria-busy", "false");
  });

  it("applies a header-only change in place, without calling paginate again", async () => {
    const f = fakeEngine();
    const { rerender } = render(
      <BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />,
    );
    f.done({ pageCount: 2, pages: [page(0, ["a"], "body"), page(1, ["b"], "body")] });
    expect(f.paginateCalls).toBe(1);

    const headerChanged = applyHeader(DEFAULT_DESIGN, "recto", "{author}");
    rerender(
      <BookPreview document={document} design={headerChanged} onReset={() => {}} createEngine={f.create} />,
    );
    await settleReflow();

    expect(f.paginateCalls).toBe(1); // render-only: engine untouched
  });

  it("warms the worker for a curated face but not for the system serif", async () => {
    const f = fakeEngine();
    const { rerender } = render(
      <BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />,
    );
    f.done({ pageCount: 1, pages: [page(0, ["a"], "opener")] });
    // Default is the system serif: no warm request on the initial pass.
    expect(f.warmedIds.flat()).not.toContain("eb-garamond");

    const curated = { ...DEFAULT_DESIGN, font: { ...DEFAULT_DESIGN.font, family: '"EB Garamond", Georgia, serif' } };
    rerender(<BookPreview document={document} design={curated} onReset={() => {}} createEngine={f.create} />);
    await settleReflow();
    expect(f.warmedIds.flat()).toContain("eb-garamond");
  });
});

describe("BookPreview paper-budget solve", () => {
  const budget = (target: number, seq: number) => ({
    target,
    base: DEFAULT_DESIGN,
    bounds: DEFAULT_BOUNDS,
    seq,
  });
  const solveStats: PassStats = { totalLines: 90, openerPages: 1, blankPages: 0 };
  const winner = applyFontSize(DEFAULT_DESIGN, 9.5);
  const outcome: SolveOutcome = {
    targetSheets: 2,
    sheets: 2,
    design: winner,
    achieved: "hit",
    passes: 1,
  };

  it("debounces seq bumps into one solve carrying target, base, and bounds", async () => {
    const f = fakeEngine();
    const { rerender } = render(
      <BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />,
    );
    f.done({ pageCount: 8, pages: Array.from({ length: 8 }, (_, i) => page(i, ["a line"])) });

    rerender(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        budget={budget(40, 1)}
        createEngine={f.create}
      />,
    );
    rerender(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        budget={budget(42, 2)}
        createEngine={f.create}
      />,
    );
    await settleReflow();

    // One request (the debounce coalesced the drag), the latest target wins.
    expect(f.solveRequests).toEqual([
      { targetSheets: 42, base: DEFAULT_DESIGN, bounds: DEFAULT_BOUNDS },
    ]);
    // The mounted book stays up with the busy affordance during the solve.
    expect(screen.getAllByTestId("page-leaf").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Book preview" })).toHaveAttribute("aria-busy", "true");
  });

  it("commits a solve done as the winner design and never re-paginates it", async () => {
    const f = fakeEngine();
    const outcomes: SolveOutcome[] = [];
    const settled: { design: DesignSpec; pageCount: number; stats: PassStats }[] = [];
    const { rerender } = render(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        onSolveOutcome={(o) => outcomes.push(o)}
        onSettled={(s) => settled.push(s)}
        createEngine={f.create}
      />,
    );
    f.done({ pageCount: 8, pages: Array.from({ length: 8 }, (_, i) => page(i, ["a line"])) });
    // onSettled fires for a plain paginate too, with stats derived if absent.
    expect(settled).toHaveLength(1);
    expect(settled[0].pageCount).toBe(8);
    expect(settled[0].stats.totalLines).toBe(8);

    rerender(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        budget={budget(2, 1)}
        onSolveOutcome={(o) => outcomes.push(o)}
        onSettled={(s) => settled.push(s)}
        createEngine={f.create}
      />,
    );
    await settleReflow();
    f.done(
      { pageCount: 6, pages: Array.from({ length: 6 }, (_, i) => page(i, ["solved line"])) },
      solveStats,
      outcome,
    );

    // The outcome reached Studio as the same object the worker sent.
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toBe(outcome);
    expect(settled).toHaveLength(2);
    expect(settled[1]).toEqual({ design: winner, pageCount: 6, stats: solveStats });
    expect(screen.getByText("6 pages")).toBeInTheDocument();

    // Studio hands the winner design back as the design prop: no re-paginate.
    const paginatesBefore = f.paginateCalls;
    rerender(
      <BookPreview
        document={document}
        design={outcomes[0].design}
        onReset={() => {}}
        budget={budget(2, 1)}
        onSolveOutcome={(o) => outcomes.push(o)}
        onSettled={(s) => settled.push(s)}
        createEngine={f.create}
      />,
    );
    await settleReflow();
    expect(f.paginateCalls).toBe(paginatesBefore);
    expect(f.solveRequests).toHaveLength(1);
  });
});

describe("BookPreview export", () => {
  const exportReq = (seq: number) => ({ seq, imposition: DEFAULT_IMPOSITION });

  function settle(f: ReturnType<typeof fakeEngine>) {
    f.done({ pageCount: 8, pages: Array.from({ length: 8 }, (_, i) => page(i, ["a line"])) });
  }

  it("calls the export client once with the settled result, design, and imposition", async () => {
    const f = fakeEngine();
    const x = fakeExport();
    const { rerender } = render(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        createEngine={f.create}
        createExport={x.create}
      />,
    );
    settle(f);
    const paginatesBefore = f.paginateCalls;

    rerender(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        exportRequest={exportReq(1)}
        createEngine={f.create}
        createExport={x.create}
      />,
    );

    expect(x.inputs).toHaveLength(1);
    expect(x.inputs[0].result.pageCount).toBe(8);
    expect(x.inputs[0].design).toEqual(DEFAULT_DESIGN);
    expect(x.inputs[0].imposition).toEqual(DEFAULT_IMPOSITION);
    // Export never re-paginates and never blanks the mounted book.
    expect(f.paginateCalls).toBe(paginatesBefore);
    expect(screen.getAllByTestId("page-leaf").length).toBeGreaterThan(0);
  });

  it("forwards progress and, on done, saves both files and reports done", async () => {
    const f = fakeEngine();
    const x = fakeExport();
    const states: ExportUiState[] = [];
    const { rerender } = render(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        onExportState={(s) => states.push(s)}
        createEngine={f.create}
        createExport={x.create}
      />,
    );
    settle(f);
    vi.mocked(triggerDownload).mockClear();

    rerender(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        exportRequest={exportReq(1)}
        onExportState={(s) => states.push(s)}
        createEngine={f.create}
        createExport={x.create}
      />,
    );
    x.progress("typeset", 4, 8);
    x.progress("impose", 1, 4);
    await act(async () => {
      x.done();
      // Let the staggered download timers fire.
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(states.some((s) => s.kind === "running" && s.phase === "typeset")).toBe(true);
    expect(states.some((s) => s.kind === "running" && s.phase === "impose")).toBe(true);
    const doneState = states.find((s) => s.kind === "done");
    expect(doneState).toBeDefined();
    expect(triggerDownload).toHaveBeenCalledTimes(2);
  });

  it("reports the error state when the export fails", () => {
    const f = fakeEngine();
    const x = fakeExport();
    const states: ExportUiState[] = [];
    const { rerender } = render(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        onExportState={(s) => states.push(s)}
        createEngine={f.create}
        createExport={x.create}
      />,
    );
    settle(f);
    rerender(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        exportRequest={exportReq(1)}
        onExportState={(s) => states.push(s)}
        createEngine={f.create}
        createExport={x.create}
      />,
    );
    x.error();
    expect(states.at(-1)).toEqual({ kind: "error" });
  });

  it("disposes the export client on unmount", () => {
    const f = fakeEngine();
    const x = fakeExport();
    const { rerender, unmount } = render(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        createEngine={f.create}
        createExport={x.create}
      />,
    );
    settle(f);
    rerender(
      <BookPreview
        document={document}
        design={DEFAULT_DESIGN}
        onReset={() => {}}
        exportRequest={exportReq(1)}
        createEngine={f.create}
        createExport={x.create}
      />,
    );
    unmount();
    expect(x.dispose).toHaveBeenCalled();
  });
});

describe("BookPreview virtualization", () => {
  it("mounts a bounded number of leaves at the top, middle, and end of a long book", async () => {
    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    const pages = Array.from({ length: 300 }, (_, i) => page(i, ["a line"]));
    f.done({ pageCount: 300, pages });

    const BOUND = 8;
    const viewport = screen.getByRole("region", { name: "Book preview" });

    expect(screen.getAllByTestId("page-leaf").length).toBeLessThanOrEqual(BOUND);
    await scrollTo(viewport, 140_000);
    expect(screen.getAllByTestId("page-leaf").length).toBeLessThanOrEqual(BOUND);
    await scrollTo(viewport, 10_000_000);
    expect(screen.getAllByTestId("page-leaf").length).toBeLessThanOrEqual(BOUND);
    // The end of the book is reachable (last folio mounted after scrolling).
    expect(screen.getByText("300")).toBeInTheDocument();
  });

  it("re-groups on a mode change without re-paginating", () => {
    let roCb: ResizeObserverCallback | null = null;
    class MockRO {
      constructor(cb: ResizeObserverCallback) {
        roCb = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", MockRO as unknown as typeof ResizeObserver);

    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    f.done({ pageCount: 6, pages: Array.from({ length: 6 }, (_, i) => page(i, ["x"])) });

    // Single mode (fallback width): each row is one leaf, no empty leaf.
    expect(screen.queryByTestId("empty-leaf")).not.toBeInTheDocument();

    const viewport = screen.getByRole("region", { name: "Book preview" });
    Object.defineProperty(viewport, "clientWidth", { value: 1200, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 640, configurable: true });
    act(() => roCb?.([], {} as ResizeObserver));

    // Spread mode: the first spread has an empty left leaf, without re-paginating.
    expect(screen.getByTestId("empty-leaf")).toBeInTheDocument();
    expect(f.paginateCalls).toBe(1);
  });
});

describe("BookPreview accessibility and copy", () => {
  it("labels the scroll region and summarizes the page count for assistive tech", () => {
    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    f.done({ pageCount: 1, pages: [page(0, ["only page"], "opener")] });
    expect(screen.getByRole("region", { name: "Book preview" })).toBeInTheDocument();
    const count = screen.getByText("1 page");
    expect(count).toHaveAttribute("aria-live", "polite");
  });

  it("suppresses chrome on opener and blank pages within the rendered book", () => {
    const f = fakeEngine();
    render(<BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    f.done({
      pageCount: 2,
      pages: [page(0, ["Chapter One"], "opener"), { ...page(1, []), kind: "blank", chapterIndex: -1 }],
    });
    for (const el of screen.getAllByTestId("page-leaf")) {
      expect(within(el).queryByText(/^\d+$/)).not.toBeInTheDocument(); // no folio
    }
  });

  it("uses no em-dashes, banned vocabulary, or negative empty-state openers", () => {
    const f = fakeEngine();
    const { container, rerender } = render(
      <BookPreview document={document} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />,
    );
    f.done({ pageCount: 0, pages: [] });
    const emptyText = container.textContent ?? "";

    rerender(<BookPreview document={{ ...document }} design={DEFAULT_DESIGN} onReset={() => {}} createEngine={f.create} />);
    f.error();
    const errorText = container.textContent ?? "";

    for (const text of [emptyText, errorText]) {
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/seamless|effortless|unlock|elevate|empower|leverage|robust|dive in/i);
      expect(text).not.toMatch(/You don't have|No .* yet|Nothing .* here|Unable to|Something went wrong/i);
    }
  });
});
