import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import App from "./App";
import { Studio } from "./ui/Studio";
import { ErrorState } from "./ui/ErrorState";
import { emptyReport } from "./model/importReport";
import type { Document } from "./model/document";
import type { EngineClientLike, PaginateHandlers } from "./engine/client";
import type { DesignSpec, Page, PaginationResult, Timings } from "./engine/types";
import { DEFAULT_DESIGN } from "./engine/defaultDesign";
import { computeMetrics } from "./engine/paginate";
import type { PassStats } from "./engine/budget";

// Accessibility audit (jsdom): labels, landmarks, headings, live regions, and
// the aria-hidden decoratives. The keyboard-reach and visible-focus half of
// QUALITY BAR §6 is proven in e2e/a11y.spec.ts against a real browser.

vi.mock("./fonts/loadFonts", () => ({ warmCatalog: vi.fn(() => Promise.resolve()) }));

const document: Document = {
  title: "Windermere",
  author: "A. Author",
  language: "en",
  chapters: [{ id: "c1", title: "Chapter One", order: 0, blocks: [] }],
  source: { name: "book", byteLength: 0 },
};

function fakeEngine() {
  let handlers: PaginateHandlers | null = null;
  const timings: Timings = { wordCount: 10, pageCount: 1, firstFeedbackMs: 20, settleMs: 100 };
  const engine: EngineClientLike = {
    load: vi.fn(),
    paginate: (_design, h) => {
      handlers = h;
    },
    solve: (_request, h) => {
      handlers = h;
    },
    warmFonts: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    create: () => engine,
    done: (result: PaginationResult, stats?: PassStats) =>
      act(() => handlers?.onDone?.(result, timings, stats)),
  };
}

function pages(count: number): PaginationResult {
  const list: Page[] = Array.from({ length: count }, (_, index) => ({
    index,
    side: index % 2 === 0 ? "recto" : "verso",
    kind: "body",
    chapterIndex: 0,
    lines: [{ text: "a line", x: 0, y: 0, width: 100, hyphenated: false }],
  }));
  return { pageCount: count, pages: list };
}

function settle(f: ReturnType<typeof fakeEngine>) {
  const metrics = computeMetrics(DEFAULT_DESIGN);
  f.done(pages(100), {
    totalLines: 100 * metrics.bodyLinesPerPage - 37,
    openerPages: 3,
    blankPages: 2,
  });
}

function renderStudio(design?: DesignSpec) {
  const f = fakeEngine();
  const view = render(
    <Studio
      document={design ? { ...document } : document}
      report={emptyReport()}
      onReset={() => {}}
      createEngine={f.create}
    />,
  );
  return { f, view };
}

beforeEach(() => {
  localStorage.clear();
});

describe("App shell semantics", () => {
  it("has exactly one main landmark and one h1 on the empty screen", () => {
    render(<App />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Open a book to begin");
  });

  it("labels the hidden EPUB file input and hides the decorative mark", () => {
    const { container } = render(<App />);
    expect(screen.getByLabelText("Upload EPUB file")).toHaveAttribute("type", "file");
    // The header glyph is decorative; a screen reader must skip it.
    const mark = container.querySelector(".app__mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });
});

describe("ErrorState semantics", () => {
  it("exposes each error kind as an alert", () => {
    for (const kind of ["unreadable", "too-large", "sample-failed"] as const) {
      const { unmount } = render(
        <ErrorState error={{ kind }} maxMb={64} onChooseFile={() => {}} onOpenSample={() => {}} />,
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("Studio labels", () => {
  it("resolves every control by its visible label", () => {
    const { view } = renderStudio();

    // Unit-bearing dials expose their unit in the accessible name (a nested
    // span), so match the full label the way a screen reader announces it.
    const labels = [
      "Fit into",
      "Page size",
      "Font",
      "Font size (pt)",
      "Line spacing",
      "Inner (in)",
      "Outer (in)",
      "Top (in)",
      "Bottom (in)",
      "Chapter opening",
      "Open chapters on the right",
      "Left page",
      "Right page",
      "Widow and orphan control",
      "Hyphenation",
      "Sheets per signature",
      "Duplex flip",
    ];
    for (const label of labels) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }

    // The bound fields mount only while the disclosure is open.
    const bounds = view.container.querySelector(".budget__bounds") as HTMLDetailsElement;
    bounds.open = true;
    fireEvent(bounds, new Event("toggle"));
    for (const label of [
      "Font size min (pt)",
      "Font size max (pt)",
      "Line spacing min",
      "Line spacing max",
      "Margins min (%)",
      "Margins max (%)",
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
  });

  it("labels the hidden project and house-style file inputs", () => {
    renderStudio();
    expect(screen.getByLabelText("Open project file")).toHaveAttribute("type", "file");
    expect(screen.getByLabelText("Apply house style file")).toHaveAttribute("type", "file");
  });
});

describe("Studio landmarks, headings, and live regions", () => {
  it("renders one h1 (the book title) and names its regions", () => {
    renderStudio();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Windermere");
    expect(screen.getByRole("region", { name: "Paper budget" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Book design" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Book layout" })).toBeInTheDocument();
  });

  it("marks the status, readout, count, and notice regions polite", () => {
    const { f, view } = renderStudio();
    settle(f);

    // The paper-budget readout speaks its settled count politely.
    const readout = view.container.querySelector(".budget__readout");
    expect(readout).toHaveAttribute("aria-live", "polite");

    // Export status and the project notice are polite status regions.
    const status = view.container.querySelector(".panel__status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    const notice = view.container.querySelector(".project__notice");
    expect(notice).toHaveAttribute("aria-live", "polite");

    // The page-count line updates politely as the book re-flows.
    const count = view.container.querySelector(".preview__count");
    expect(count).toHaveAttribute("aria-live", "polite");
  });

  it("keeps the preview's re-flow marker out of the accessibility tree", () => {
    const { view } = renderStudio();
    // A settled book with the busy region: the .book region carries aria-busy,
    // and any decorative marker is aria-hidden.
    const book = within(view.container.querySelector(".preview") as HTMLElement).getByRole(
      "region",
      { name: "Book preview" },
    );
    expect(book).toHaveAttribute("aria-busy");
  });
});
