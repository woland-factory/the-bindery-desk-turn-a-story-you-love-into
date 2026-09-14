import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PageView } from "./PageView";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { SOFT_HYPHEN } from "../engine/lineBreak";
import type { Document } from "../model/document";
import type { Line, Page, PageKind, PageSide } from "../engine/types";

const doc: Document = {
  title: "Windermere",
  author: "A. Author",
  language: "en",
  chapters: [{ id: "c1", title: "Chapter One", order: 0, blocks: [] }],
  source: { name: "book", byteLength: 0 },
};

function line(text: string, hyphenated = false): Line {
  return { text, x: 0, y: 0, width: 100, hyphenated };
}

function page(over: Partial<Page> & { index: number; side: PageSide; kind: PageKind }): Page {
  return { chapterIndex: 0, lines: [], ...over };
}

function leaf() {
  return screen.getByTestId("page-leaf");
}

describe("PageView chrome", () => {
  it("shows the author running head and folio on a body verso", () => {
    render(
      <PageView
        page={page({ index: 1, side: "verso", kind: "body", lines: [line("Body text")] })}
        design={DEFAULT_DESIGN}
        doc={doc}
        scale={1}
      />,
    );
    expect(within(leaf()).getByText("A. Author")).toBeInTheDocument();
    expect(within(leaf()).getByText("2")).toBeInTheDocument();
  });

  it("shows the title running head on a body recto", () => {
    render(
      <PageView
        page={page({ index: 2, side: "recto", kind: "body", lines: [line("Body text")] })}
        design={DEFAULT_DESIGN}
        doc={doc}
        scale={1}
      />,
    );
    expect(within(leaf()).getByText("Windermere")).toBeInTheDocument();
    expect(within(leaf()).getByText("3")).toBeInTheDocument();
  });

  it("suppresses header and folio on a chapter opener", () => {
    render(
      <PageView
        page={page({ index: 0, side: "recto", kind: "opener", lines: [line("Chapter One")] })}
        design={DEFAULT_DESIGN}
        doc={doc}
        scale={1}
      />,
    );
    expect(within(leaf()).queryByText("Windermere")).not.toBeInTheDocument();
    expect(within(leaf()).queryByText("1")).not.toBeInTheDocument();
  });

  it("renders a blank leaf with no chrome and no lines", () => {
    render(
      <PageView
        page={page({ index: 3, side: "verso", kind: "blank", chapterIndex: -1 })}
        design={DEFAULT_DESIGN}
        doc={doc}
        scale={1}
      />,
    );
    expect(leaf().querySelector(".leaf__chrome")).toBeNull();
    expect(leaf().querySelectorAll(".leaf__line")).toHaveLength(0);
  });
});

describe("PageView soft hyphen", () => {
  it("shows a visible hyphen only when the line is hyphenated", () => {
    render(
      <PageView
        page={page({
          index: 4,
          side: "recto",
          kind: "body",
          lines: [line(`exam${SOFT_HYPHEN}`, true), line(`co${SOFT_HYPHEN}operate`, false)],
        })}
        design={DEFAULT_DESIGN}
        doc={doc}
        scale={1}
      />,
    );
    expect(screen.getByText("exam-")).toBeInTheDocument();
    expect(screen.getByText("cooperate")).toBeInTheDocument();
    // The raw soft hyphen never reaches the DOM text.
    expect(leaf().textContent).not.toContain(SOFT_HYPHEN);
  });
});
