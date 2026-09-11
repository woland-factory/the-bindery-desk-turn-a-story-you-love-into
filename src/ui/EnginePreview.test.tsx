import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { EnginePreview } from "./EnginePreview";
import type { EngineClientLike, PaginateHandlers } from "../engine/client";
import type { Document } from "../model/document";
import type { Page, PaginationResult, Timings } from "../engine/types";

const document: Document = {
  title: "Book",
  author: "Author",
  language: "en",
  chapters: [],
  source: { name: "book", byteLength: 0 },
};

function page(index: number, texts: string[]): Page {
  return {
    index,
    side: index % 2 === 0 ? "recto" : "verso",
    kind: index === 0 ? "opener" : "body",
    chapterIndex: 0,
    lines: texts.map((text) => ({ text, x: 0, y: 0, width: 100, hyphenated: false })),
  };
}

/** A fake engine whose callbacks the test fires by hand. */
function fakeEngine() {
  let handlers: PaginateHandlers | null = null;
  const engine: EngineClientLike = {
    load: vi.fn(),
    paginate: (_design, h) => {
      handlers = h;
    },
    dispose: vi.fn(),
  };
  return {
    create: () => engine,
    progress: (estimate: number, pages: Page[]) =>
      act(() => handlers?.onProgress?.(estimate, pages, 40)),
    done: (result: PaginationResult, timings: Timings) =>
      act(() => handlers?.onDone?.(result, timings)),
    error: () => act(() => handlers?.onError?.("boom")),
    dispose: engine.dispose,
  };
}

describe("EnginePreview", () => {
  it("holds a layout-stable laying-out state before the engine responds", () => {
    const f = fakeEngine();
    render(<EnginePreview document={document} createEngine={f.create} />);
    expect(screen.getByRole("heading", { name: "Laying out your book" })).toBeInTheDocument();
  });

  it("shows the estimate then the exact page count with a timing readout", () => {
    const f = fakeEngine();
    render(<EnginePreview document={document} createEngine={f.create} />);

    f.progress(12, [page(0, ["First line", "Second line"])]);
    expect(screen.getByRole("heading", { name: "About 12 pages" })).toBeInTheDocument();
    expect(screen.getByText("First line")).toBeInTheDocument();

    const result: PaginationResult = { pageCount: 11, pages: [page(0, ["First line"])] };
    const timings: Timings = { wordCount: 100, pageCount: 11, firstFeedbackMs: 40, settleMs: 900 };
    f.done(result, timings);
    expect(screen.getByRole("heading", { name: "11 pages" })).toBeInTheDocument();
    expect(screen.getByText("First view 40 ms, settled 900 ms")).toBeInTheDocument();
  });

  it("keeps the rendered pages bounded no matter the book size", () => {
    const f = fakeEngine();
    render(<EnginePreview document={document} createEngine={f.create} />);

    const pages = Array.from({ length: 500 }, (_, i) => page(i, ["a line"]));
    const result: PaginationResult = { pageCount: 500, pages };
    f.done(result, { wordCount: 9, pageCount: 500, firstFeedbackMs: 20, settleMs: 500 });

    expect(screen.getByRole("heading", { name: "500 pages" })).toBeInTheDocument();
    expect(screen.getAllByTestId("preview-page").length).toBeLessThanOrEqual(4);
  });

  it("renders the designed error state, not a crash", () => {
    const f = fakeEngine();
    render(<EnginePreview document={document} createEngine={f.create} />);
    f.error();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Run the layout again");
    expect(alert).toHaveTextContent("The layout stopped before it finished.");
  });

  it("uses no em-dashes or banned vocabulary in its visible copy", () => {
    const f = fakeEngine();
    const { container } = render(<EnginePreview document={document} createEngine={f.create} />);
    f.progress(3, [page(0, ["line one"])]);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/seamless|effortless|unlock|elevate|empower|leverage|robust/i);
    expect(text).not.toMatch(/Something went wrong|Unable to|No .* yet/i);
  });

  it("disposes the engine on unmount", () => {
    const f = fakeEngine();
    const { unmount } = render(<EnginePreview document={document} createEngine={f.create} />);
    unmount();
    expect(f.dispose).toHaveBeenCalled();
  });
});
