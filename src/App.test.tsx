import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { makeAo3, makeStandardEbooks, makeNotAZip } from "./test/epubFixtures";
import type { EngineClientLike, PaginateHandlers } from "./engine/client";
import type { ExportClientLike, ExportHandlers } from "./export/client";
import type { PaginationResult, Page } from "./engine/types";
import { markFirstRunDone } from "./ui/firstRun/persistFirstRun";

function epubFile(bytes: Uint8Array, name = "book.epub"): File {
  return new File([bytes as BlobPart], name, { type: "application/epub+zip" });
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("App: first screen and accessibility", () => {
  it("shows the empty state with one primary action and a labeled input", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Open a book to begin" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose EPUB file" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open the sample book" })).toBeVisible();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute("aria-label", "Upload EPUB file");
  });
});

describe("App: state machine on import", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("goes empty -> loading -> ready and renders parsed structure", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Open a book to begin" })).toBeInTheDocument();

    await userEvent.upload(fileInput(), epubFile(makeAo3(), "tale.epub"));

    // The parse settles into the structure view (the transient loading
    // skeleton is covered by the LoadingState component test).
    expect(await screen.findByRole("heading", { name: "A Tale of Testing" })).toBeInTheDocument();
    expect(screen.getByText("Ada Archivist · en")).toBeInTheDocument();
    // Unique chapter titles (not referenced by any drop record) prove the
    // ordered chapter list rendered.
    expect(screen.getByText("The Middle")).toBeInTheDocument();
    expect(screen.getByText("The End")).toBeInTheDocument();
    expect(screen.getByText("5 chapters")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Open a book to begin" })).not.toBeInTheDocument();
  });

  it("makes no network request while importing a user file", async () => {
    render(<App />);
    await userEvent.upload(fileInput(), epubFile(makeAo3()));
    await screen.findByRole("heading", { name: "A Tale of Testing" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the designed error state for a non-EPUB file", async () => {
    render(<App />);
    const notEpub = new File(["hello"], "notes.txt", { type: "text/plain" });
    // applyAccept:false simulates a drag-drop, which bypasses the dialog's
    // accept filter; the app's own boundary check must then reject it.
    await userEvent.upload(fileInput(), notEpub, { applyAccept: false });
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("This file is not a readable EPUB.")).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Try another file" })).toBeInTheDocument();
  });

  it("shows the designed error state for a malformed EPUB, without crashing", async () => {
    render(<App />);
    await userEvent.upload(fileInput(), epubFile(makeNotAZip(), "broken.epub"));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("This file is not a readable EPUB.")).toBeInTheDocument();
  });

  it("loads the bundled sample in one tap using only its own asset", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => makeStandardEbooks().slice().buffer,
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open the sample book" }));

    expect(
      await screen.findByRole("heading", { name: "The Public Domain Reader" }),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("/sample/aesops-fables.epub");
  });
});

function pageResult(count: number): PaginationResult {
  const pages: Page[] = Array.from({ length: count }, (_, index) => ({
    index,
    side: index % 2 === 0 ? "recto" : "verso",
    kind: "body",
    chapterIndex: 0,
    lines: [{ text: "a line", x: 0, y: 0, width: 100, hyphenated: false }],
  }));
  return { pageCount: count, pages };
}

function fakeEngine() {
  let handlers: PaginateHandlers | null = null;
  const engine: EngineClientLike = {
    load: vi.fn(),
    paginate: (_design, h) => {
      handlers = h;
    },
    warmFonts: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    create: () => engine,
    settle: () =>
      act(() =>
        handlers?.onDone?.(pageResult(6), { wordCount: 10, pageCount: 6, firstFeedbackMs: 5, settleMs: 20 }),
      ),
  };
}

function fakeExport() {
  let handlers: ExportHandlers | null = null;
  const client: ExportClientLike = {
    export: (_input, h) => {
      handlers = h;
    },
    dispose: vi.fn(),
  };
  return {
    create: () => client,
    finish: () => act(() => handlers?.onDone?.(new ArrayBuffer(8), new ArrayBuffer(4))),
  };
}

describe("App: guided first run", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => makeStandardEbooks().slice().buffer,
    });
    vi.stubGlobal("fetch", fetchSpy);
    URL.createObjectURL = vi.fn(() => "blob:mock") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  async function openSample() {
    await userEvent.click(screen.getByRole("button", { name: "Open the sample book" }));
    await screen.findByRole("heading", { name: "The Public Domain Reader" });
  }

  it("shows step 1 to a brand-new visitor and walks to the first export", async () => {
    const engine = fakeEngine();
    const exporter = fakeExport();
    render(<App createEngine={engine.create} createExport={exporter.create} />);

    // Step 1: open a book.
    expect(screen.getByText("Open the sample to see a real book.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();

    // Opening the sample advances to step 2.
    await openSample();
    expect(await screen.findByText("Drag the slider to pick your sheet count.")).toBeInTheDocument();

    // Next advances to step 3.
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Click Export to save your two PDFs.")).toBeInTheDocument();

    // Settle so Export enables, then export: the first success ends the tour.
    await engine.settle();
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await exporter.finish();

    expect(screen.queryByText("Click Export to save your two PDFs.")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("bindery.firstRun")!)).toEqual({ v: 1, done: true });
  });

  it("tears down the coach-mark when a bad file unloads the book", async () => {
    const engine = fakeEngine();
    render(<App createEngine={engine.create} />);

    // Reach step 2 (the slider): open the sample, then advance.
    await openSample();
    expect(
      await screen.findByText("Drag the slider to pick your sheet count."),
    ).toBeInTheDocument();

    // Now choose a file that fails to parse. The studio (and its slider) leaves.
    await userEvent.upload(fileInput(), epubFile(makeNotAZip(), "broken.epub"));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("This file is not a readable EPUB.")).toBeInTheDocument();

    // The coach-mark does not strand over the error panel: the slider step is
    // gone and the recovery action is reachable.
    expect(
      screen.queryByText("Drag the slider to pick your sheet count."),
    ).not.toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Try another file" })).toBeInTheDocument();
  });

  it("never shows the walkthrough to a returning visitor", () => {
    markFirstRunDone();
    render(<App />);
    expect(screen.queryByText("Open the sample to see a real book.")).not.toBeInTheDocument();
  });

  it("Skip dismisses the tour permanently", async () => {
    const { unmount } = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByText("Open the sample to see a real book.")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("bindery.firstRun")!)).toEqual({ v: 1, done: true });

    // A reload keeps it hidden.
    unmount();
    render(<App />);
    expect(screen.queryByText("Open the sample to see a real book.")).not.toBeInTheDocument();
  });
});
