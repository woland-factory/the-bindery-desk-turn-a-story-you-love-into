import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { makeAo3, makeStandardEbooks, makeNotAZip } from "./test/epubFixtures";

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
