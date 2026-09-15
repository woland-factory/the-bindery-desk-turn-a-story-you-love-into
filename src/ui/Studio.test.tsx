import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { Studio } from "./Studio";
import { emptyReport } from "../model/importReport";
import type { Document } from "../model/document";

vi.mock("../fonts/loadFonts", () => ({ warmCatalog: vi.fn(() => Promise.resolve()) }));
import { warmCatalog } from "../fonts/loadFonts";

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

beforeEach(() => {
  localStorage.clear();
  vi.mocked(warmCatalog).mockClear();
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
