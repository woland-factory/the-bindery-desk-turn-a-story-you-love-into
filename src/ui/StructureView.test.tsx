import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StructureView } from "./StructureView";
import type { Document } from "../model/document";
import type { ImportReport } from "../model/importReport";

const doc: Document = {
  title: "Book of Tests",
  author: "T. Writer",
  language: "en",
  chapters: [
    {
      id: "c1",
      title: "Opening",
      order: 0,
      blocks: [
        { type: "heading", keptOrDropped: "kept", level: 1, text: "Opening" },
        { type: "paragraph", keptOrDropped: "kept", text: "One." },
        { type: "image", keptOrDropped: "dropped", src: "a.png", dropReason: "image" },
      ],
    },
    { id: "c2", title: "Closing", order: 1, blocks: [] },
  ],
  source: { name: "t.epub", byteLength: 10 },
};

const report: ImportReport = {
  keptCounts: { headings: 1, paragraphs: 1, notes: 0 },
  droppedCounts: { images: 1, notes: 0, boilerplate: 0 },
  records: [
    { chapterOrder: 0, chapterTitle: "Opening", kind: "image", reason: "image", detail: "a.png" },
  ],
};

describe("StructureView", () => {
  it("shows title, byline, ordered chapter titles, and kept-block counts", () => {
    render(<StructureView document={doc} report={report} onReset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Book of Tests" })).toBeInTheDocument();
    expect(screen.getByText("T. Writer · en")).toBeInTheDocument();

    const titles = screen.getAllByText(/Opening|Closing/).map((n) => n.textContent);
    expect(titles).toContain("Opening");
    expect(titles).toContain("Closing");

    expect(screen.getByText("2 chapters")).toBeInTheDocument();
    expect(screen.getByText("2 blocks")).toBeInTheDocument(); // chapter 1 kept blocks
    expect(screen.getByText("0 blocks")).toBeInTheDocument(); // chapter 2 kept blocks
  });

  it("summarizes kept and set-aside counts in positive language", () => {
    render(<StructureView document={doc} report={report} onReset={() => {}} />);
    expect(
      screen.getByText("Kept 1 paragraph and 1 heading. Set aside 1 image."),
    ).toBeInTheDocument();
  });

  it("lists set-aside records on expand", async () => {
    render(<StructureView document={doc} report={report} onReset={() => {}} />);
    await userEvent.click(screen.getByText("Show what was set aside"));
    expect(screen.getByText("a.png")).toBeInTheDocument();
  });

  it("calls onReset from the open-another-book action", async () => {
    const onReset = vi.fn();
    render(<StructureView document={doc} report={report} onReset={onReset} />);
    await userEvent.click(screen.getByRole("button", { name: "Open another book" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
