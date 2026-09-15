import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { BookPreview } from "./BookPreview";
import type { EngineClientLike, PaginateHandlers } from "../engine/client";
import type { Document } from "../model/document";
import type { DesignSpec, Page, PageKind, PageSide, PaginationResult, Timings } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { applyFontSize, applyHeader } from "./design/designPatch";

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
  const engine: EngineClientLike = {
    load: vi.fn(),
    paginate: (design, h) => {
      paginateCalls++;
      designs.push(design);
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
    progress: (pages: Page[]) => act(() => handlers?.onProgress?.(pages.length, pages, 40)),
    done: (result: PaginationResult) => act(() => handlers?.onDone?.(result, timings)),
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
