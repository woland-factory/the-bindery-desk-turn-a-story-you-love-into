import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { Studio } from "./Studio";
import { emptyReport } from "../model/importReport";
import type { Document } from "../model/document";
import type { EngineClientLike, PaginateHandlers, SolveRequest } from "../engine/client";
import type { DesignSpec, Page, PaginationResult, Timings } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { computeMetrics } from "../engine/paginate";
import { DEFAULT_BOUNDS, type PassStats, type SolveOutcome } from "../engine/budget";
import { applyFontSize } from "./design/designPatch";

vi.mock("../fonts/loadFonts", () => ({ warmCatalog: vi.fn(() => Promise.resolve()) }));
import { warmCatalog } from "../fonts/loadFonts";

const { saveProject, saveHouseStyle } = vi.hoisted(() => ({
  saveProject: vi.fn(),
  saveHouseStyle: vi.fn(),
}));
vi.mock("../project/projectIo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../project/projectIo")>();
  return { ...actual, saveProject, saveHouseStyle };
});
import { buildHouseStyle, buildProject, type SourceRef } from "../project/projectFile";
import { DEFAULT_IMPOSITION } from "../export/impose";

const document: Document = {
  title: "Windermere",
  author: "A. Author",
  language: "en",
  chapters: [{ id: "c1", title: "Chapter One", order: 0, blocks: [] }],
  source: { name: "book", byteLength: 0 },
};

function renderStudio() {
  return render(<Studio document={document} report={emptyReport()} onReset={() => {}} />);
}

const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

function fakeEngine() {
  let handlers: PaginateHandlers | null = null;
  const solveRequests: SolveRequest[] = [];
  const paginated: DesignSpec[] = [];
  const timings: Timings = { wordCount: 10, pageCount: 1, firstFeedbackMs: 20, settleMs: 100 };
  const engine: EngineClientLike = {
    load: vi.fn(),
    paginate: (design, h) => {
      paginated.push(design);
      handlers = h;
    },
    solve: (request, h) => {
      solveRequests.push(request);
      handlers = h;
    },
    warmFonts: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    create: () => engine,
    solveRequests,
    paginated,
    done: (result: PaginationResult, stats?: PassStats, solve?: SolveOutcome) =>
      act(() => handlers?.onDone?.(result, timings, stats, solve)),
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

/** A settled pass big enough that the drag range spans many sheets. */
function settleBig(f: ReturnType<typeof fakeEngine>) {
  const metrics = computeMetrics(DEFAULT_DESIGN);
  f.done(pages(100), {
    totalLines: 100 * metrics.bodyLinesPerPage - 37,
    openerPages: 3,
    blankPages: 2,
  });
}

function renderBudgetStudio() {
  const f = fakeEngine();
  const view = render(
    <Studio document={document} report={emptyReport()} onReset={() => {}} createEngine={f.create} />,
  );
  return { f, view };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(warmCatalog).mockClear();
  saveProject.mockClear();
  saveHouseStyle.mockClear();
});

describe("Studio", () => {
  it("renders the control panel, the preview, and the structure view", () => {
    renderStudio();
    expect(screen.getByRole("region", { name: "Book design" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Book preview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Windermere" })).toBeInTheDocument();
  });

  it("persists a dial change and restores it on remount", async () => {
    const { unmount } = renderStudio();
    fireEvent.change(screen.getByLabelText(/Font size/i), { target: { value: "16" } });
    await wait(300); // let the debounced save fire

    const stored = JSON.parse(localStorage.getItem("bindery.design") ?? "{}");
    expect(stored.design.font.sizePt).toBe(16);

    unmount();
    renderStudio();
    expect(screen.getByLabelText(/Font size/i)).toHaveValue(16);
  });

  it("resetting cancels a pending save, so defaults survive a reload", async () => {
    const { unmount } = renderStudio();
    // Change a dial, then reset within the 250ms save debounce window.
    fireEvent.change(screen.getByLabelText(/Font size/i), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await wait(300); // give the now-cancelled debounced save a chance to fire

    // The pre-reset dial never reaches storage; defaults are what persist.
    const stored = JSON.parse(localStorage.getItem("bindery.design") ?? "{}");
    expect(stored.design.font.sizePt).toBe(11);

    unmount();
    renderStudio();
    expect(screen.getByLabelText(/Font size/i)).toHaveValue(11);
  });

  it("warms fonts after first paint, not during the initial render", async () => {
    renderStudio();
    // The panel rendered without waiting on warming.
    expect(screen.getByRole("region", { name: "Book design" })).toBeInTheDocument();
    expect(warmCatalog).not.toHaveBeenCalled();
    await wait(0);
    expect(warmCatalog).toHaveBeenCalled();
  });
});

describe("Studio paper budget", () => {
  it("disables the slider until the first settle, then commits with the current base and bounds", async () => {
    const { f } = renderBudgetStudio();
    const slider = screen.getByLabelText("Fit into");
    expect(slider).toBeDisabled();
    const budgetRegion = screen.getByRole("region", { name: "Paper budget" });
    expect(within(budgetRegion).getByText("Laying out your book")).toBeInTheDocument();

    settleBig(f);
    expect(slider).toBeEnabled();
    expect(screen.getByText("25 sheets · 7 signatures of 4 sheets")).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "20" } });
    await wait(25); // the ~16ms re-flow debounce
    expect(f.solveRequests).toHaveLength(1);
    expect(f.solveRequests[0]).toEqual({
      targetSheets: 20,
      base: DEFAULT_DESIGN,
      bounds: DEFAULT_BOUNDS,
    });
    expect(screen.getByText("Fitting your book")).toBeInTheDocument();
  });

  it("applies a solve outcome to the dials and persistence without moving the base", async () => {
    const { f } = renderBudgetStudio();
    settleBig(f);
    fireEvent.change(screen.getByLabelText("Fit into"), { target: { value: "20" } });
    await wait(25);

    const winner = applyFontSize(DEFAULT_DESIGN, 9.5);
    f.done(pages(78), { totalLines: 900, openerPages: 3, blankPages: 2 }, {
      targetSheets: 20,
      sheets: 20,
      design: winner,
      achieved: "hit",
      passes: 2,
    });

    // The dials show the solver's choice and it persists like any design.
    expect(screen.getByLabelText(/Font size/i, { selector: "#font-size" })).toHaveValue(9.5);
    expect(screen.getByText("20 sheets · 5 signatures of 4 sheets")).toBeInTheDocument();
    await wait(300);
    const stored = JSON.parse(localStorage.getItem("bindery.design") ?? "{}");
    expect(stored.design.font.sizePt).toBe(9.5);
    // The applied design was never re-paginated: one initial pass only.
    expect(f.paginated).toHaveLength(1);

    // The next commit still solves from the manual base, not the winner.
    fireEvent.change(screen.getByLabelText("Fit into"), { target: { value: "22" } });
    await wait(25);
    expect(f.solveRequests[1].base).toEqual(DEFAULT_DESIGN);
  });

  it("shows the clamped report and returns to the settled readout after a manual change", async () => {
    const { f } = renderBudgetStudio();
    settleBig(f);
    fireEvent.change(screen.getByLabelText("Fit into"), { target: { value: "8" } });
    await wait(25);

    const dense = applyFontSize(DEFAULT_DESIGN, 9);
    f.done(pages(60), { totalLines: 800, openerPages: 3, blankPages: 2 }, {
      targetSheets: 8,
      sheets: 15,
      design: dense,
      achieved: "clamped-dense",
      passes: 1,
    });
    expect(
      screen.getByText("Your bounds reach 15 sheets at the tightest. Loosen a bound to go lower."),
    ).toBeInTheDocument();

    // A manual dial change takes over: base moves, the clamped report clears.
    fireEvent.change(screen.getByLabelText(/Font size/i, { selector: "#font-size" }), {
      target: { value: "12" },
    });
    expect(screen.getByText("15 sheets · 4 signatures of 4 sheets")).toBeInTheDocument();

    // The re-paginate for the manual change settles with coherent stats, so
    // the derived range spans well past the next commit's target.
    const lpp = computeMetrics(DEFAULT_DESIGN).bodyLinesPerPage;
    f.done(pages(80), { totalLines: 80 * lpp - 25, openerPages: 2, blankPages: 1 });
    fireEvent.change(screen.getByLabelText("Fit into"), { target: { value: "18" } });
    await wait(25);
    const lastRequest = f.solveRequests[f.solveRequests.length - 1];
    expect(lastRequest.base.font.sizePt).toBe(12);
  });

  it("persists bounds edits and re-derives the slider range from them", async () => {
    const { f, view } = renderBudgetStudio();
    settleBig(f);
    const slider = screen.getByLabelText("Fit into");
    const maxBefore = Number(slider.getAttribute("max"));

    const details = view.container.querySelector(".budget__bounds") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    fireEvent.change(screen.getByLabelText("Font size max (pt)"), { target: { value: "16" } });
    const stored = JSON.parse(localStorage.getItem("bindery.budget") ?? "{}");
    expect(stored.bounds.fontMaxPt).toBe(16);
    expect(Number(slider.getAttribute("max"))).toBeGreaterThan(maxBefore);
    // Bounds edits never trigger a solve by themselves.
    await wait(25);
    expect(f.solveRequests).toHaveLength(0);
  });

  it("collapses to a disabled slider when the range is a single value", () => {
    const { f } = renderBudgetStudio();
    f.done(pages(2), { totalLines: 30, openerPages: 1, blankPages: 0 });
    const slider = screen.getByLabelText("Fit into");
    expect(slider).toBeDisabled();
    // The readout still reports the real book.
    expect(screen.getByText("1 sheet · 1 signature of 4 sheets")).toBeInTheDocument();
  });
});

describe("Studio project and presets", () => {
  const source: SourceRef = { name: "book", sha256: "hash-a", byteLength: 0 };

  function openFile(view: ReturnType<typeof render>, text: string, label: string) {
    const input = view.container.querySelector(
      `input[aria-label="${label}"]`,
    ) as HTMLInputElement;
    return act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([text], "f.json", { type: "application/json" })] },
      });
      // Let the async file read and the resulting apply flush.
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  it("renders four project actions subordinate to the primary Export button", () => {
    renderStudio();
    expect(screen.getByRole("button", { name: "Export" })).toHaveClass("btn--primary");
    for (const name of ["Save project", "Open project", "Save house style", "Apply house style"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("btn--ghost");
    }
  });

  it("saves a project built from the current book and settings", async () => {
    const { f } = renderBudgetStudio();
    settleBig(f);
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    expect(saveProject).toHaveBeenCalledTimes(1);
    const [file, title] = saveProject.mock.calls[0];
    expect(file.kind).toBe("bindery-project");
    expect(file.source).toEqual({ name: "book", byteLength: 0 });
    expect(file.design.font.sizePt).toBe(DEFAULT_DESIGN.font.sizePt);
    expect(title).toBe("Windermere");
    expect(screen.getByText("Saved your project.")).toBeInTheDocument();
  });

  it("saves a house style with no source", () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: "Save house style" }));
    expect(saveHouseStyle).toHaveBeenCalledTimes(1);
    const [file] = saveHouseStyle.mock.calls[0];
    expect(file.kind).toBe("bindery-housestyle");
    expect("source" in file).toBe(false);
    expect(screen.getByText("Saved your house style.")).toBeInTheDocument();
  });

  it("opens a project, applies and persists its settings, and re-paginates", async () => {
    const { f, view } = renderBudgetStudio();
    settleBig(f);
    const paginatesBefore = f.paginated.length;

    const project = buildProject(
      source,
      applyFontSize(DEFAULT_DESIGN, 13),
      { ...DEFAULT_BOUNDS, fontMaxPt: 16 },
      { sheetsPerSignature: 2, flip: "short-edge" },
    );
    await openFile(view, JSON.stringify(project), "Open project file");
    await wait(25); // the re-flow debounce

    // The dials move to the restored design and it persists.
    expect(screen.getByLabelText(/Font size/i, { selector: "#font-size" })).toHaveValue(13);
    expect(JSON.parse(localStorage.getItem("bindery.design")!).design.font.sizePt).toBe(13);
    expect(JSON.parse(localStorage.getItem("bindery.budget")!).bounds.fontMaxPt).toBe(16);
    expect(JSON.parse(localStorage.getItem("bindery.print")!).imposition).toEqual({
      sheetsPerSignature: 2,
      flip: "short-edge",
    });
    // The design change drove exactly one further paginate; no re-parse.
    expect(f.paginated.length).toBe(paginatesBefore + 1);
  });

  it("reports a mismatched source but still applies the settings", async () => {
    const doc: Document = { ...document, source: { name: "book", byteLength: 0, sha256: "hash-b" } };
    const f = fakeEngine();
    const view = render(
      <Studio document={doc} report={emptyReport()} onReset={() => {}} createEngine={f.create} />,
    );
    const project = buildProject(source, applyFontSize(DEFAULT_DESIGN, 12), DEFAULT_BOUNDS, DEFAULT_IMPOSITION);
    await openFile(view, JSON.stringify(project), "Open project file");
    expect(
      screen.getByText("Settings applied. This project came from a different book."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Font size/i, { selector: "#font-size" })).toHaveValue(12);
  });

  it("shows a plain loaded notice when the source hashes match", async () => {
    const doc: Document = { ...document, source: { name: "book", byteLength: 0, sha256: "hash-a" } };
    const f = fakeEngine();
    const view = render(
      <Studio document={doc} report={emptyReport()} onReset={() => {}} createEngine={f.create} />,
    );
    const project = buildProject(source, DEFAULT_DESIGN, DEFAULT_BOUNDS, DEFAULT_IMPOSITION);
    await openFile(view, JSON.stringify(project), "Open project file");
    expect(screen.getByText("Project loaded.")).toBeInTheDocument();
  });

  it("applies a house style saved from one book to a different book", async () => {
    const other: Document = {
      title: "Another Book",
      author: "B. Writer",
      language: "en",
      chapters: [{ id: "x", title: "One", order: 0, blocks: [] }],
      source: { name: "other", byteLength: 5, sha256: "hash-z" },
    };
    const f = fakeEngine();
    const view = render(
      <Studio document={other} report={emptyReport()} onReset={() => {}} createEngine={f.create} />,
    );
    const paginatesBefore = f.paginated.length;
    const style = buildHouseStyle(applyFontSize(DEFAULT_DESIGN, 14), DEFAULT_BOUNDS, DEFAULT_IMPOSITION);
    await openFile(view, JSON.stringify(style), "Apply house style file");
    await wait(25);

    expect(screen.getByText("House style applied.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Font size/i, { selector: "#font-size" })).toHaveValue(14);
    expect(f.paginated.length).toBe(paginatesBefore + 1);
  });

  it("shows a plain error for an unreadable file and changes no setting", async () => {
    const { view } = renderBudgetStudio();
    fireEvent.change(screen.getByLabelText(/Font size/i, { selector: "#font-size" }), {
      target: { value: "17" },
    });
    await openFile(view, "not json at all {", "Open project file");
    expect(
      screen.getByText("This file did not load. Choose a project or house style saved here."),
    ).toBeInTheDocument();
    // The dial the user set is untouched.
    expect(screen.getByLabelText(/Font size/i, { selector: "#font-size" })).toHaveValue(17);
  });

  it("has swept, human copy in its notices", async () => {
    const { view } = renderBudgetStudio();
    const notices = [
      "Saved your project.",
      "Saved your house style.",
      "Project loaded.",
      "House style applied.",
      "Settings applied. This project came from a different book.",
      "This file did not load. Choose a project or house style saved here.",
    ];
    for (const notice of notices) {
      expect(notice).not.toMatch(/[—–]/);
      expect(notice).not.toMatch(/seamless|effortless|unlock|elevate|empower|leverage|robust/i);
      expect(notice).not.toMatch(/You don't have|No .* yet|Nothing .* here|Unable to|Something went wrong/i);
    }
    void view;
  });
});

describe("Studio export and print setup", () => {
  it("enables Export after the first settle and does not export on a print-setup change", async () => {
    const { f } = renderBudgetStudio();
    // Before a settle, Export is disabled.
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    settleBig(f);
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();

    // A print-setup edit persists imposition and never triggers a solve/paginate.
    const paginatesBefore = f.paginated.length;
    fireEvent.change(screen.getByLabelText("Sheets per signature"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Duplex flip"), { target: { value: "short-edge" } });
    await wait(25);
    expect(f.solveRequests).toHaveLength(0);
    expect(f.paginated.length).toBe(paginatesBefore);
    const stored = JSON.parse(localStorage.getItem("bindery.print") ?? "{}");
    expect(stored.imposition).toEqual({ sheetsPerSignature: 2, flip: "short-edge" });
  });
});
