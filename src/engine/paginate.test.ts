import { describe, it, expect } from "vitest";
import type { Block, Chapter, Document } from "../model/document";
import type { DesignSpec } from "./types";
import { paginate, computeMetrics } from "./paginate";
import { SyntheticMeasurer } from "./measurer";

// Uniform measurer: every glyph 1.0 * size, a space 0.5. At size 10 a 5-glyph
// word is 50px, well inside the 144px test column, so each short paragraph is
// exactly one line and page math is hand-computable.
const measurer = new SyntheticMeasurer({ " ": 0.5 }, 1);

function chapter(order: number, paraCount: number): Chapter {
  const blocks: Block[] = [{ type: "heading", keptOrDropped: "kept", level: 1, text: "Title" }];
  for (let i = 0; i < paraCount; i++) {
    blocks.push({ type: "paragraph", keptOrDropped: "kept", text: "wwwww" });
  }
  return { id: `c${order}`, title: "Title", order, blocks };
}

function doc(chapters: Chapter[]): Document {
  return { title: "T", author: "A", language: "en", chapters, source: { name: "t", byteLength: 0 } };
}

// trim 2 x 2.5 in, 0.25 margins: column (2-0.5)*96 = 144px, text area
// (2.5-0.5)*96 = 192px. lineHeight 15pt = 20px -> body holds 9 lines. Top
// drop 60pt = 80px -> opener holds floor((192-80)/20) = 5 lines.
const design: DesignSpec = {
  trim: { w: 2, h: 2.5, unit: "in" },
  font: { family: "test", sizePt: 7.5, lineHeightPt: 15 },
  margins: { inner: 0.25, outer: 0.25, top: 0.25, bottom: 0.25 },
  chapterOpening: { topDropPt: 60, startRecto: true },
  runningHeader: { verso: "", recto: "", showOnOpener: false },
  widowControl: false,
  hyphenation: false,
};

describe("computeMetrics", () => {
  it("derives the hand-computed capacities", () => {
    const m = computeMetrics(design);
    expect(m.columnPx).toBe(144);
    expect(m.lineHeightPx).toBe(20);
    expect(m.bodyLinesPerPage).toBe(9);
    expect(m.openerTopDropPx).toBe(80);
    expect(m.openerLinesPerPage).toBe(5);
  });
});

describe("paginate: page assembly and chapter/recto/blank rules", () => {
  it("fills opener then body pages to the per-page line capacity", () => {
    // One chapter: heading + 8 paragraphs = 9 lines. Opener holds 5, body 4.
    const result = paginate(doc([chapter(0, 8)]), design, measurer);
    expect(result.pageCount).toBe(2);
    expect(result.pages[0].kind).toBe("opener");
    expect(result.pages[0].lines).toHaveLength(5);
    expect(result.pages[1].kind).toBe("body");
    expect(result.pages[1].lines).toHaveLength(4);
    // Opener lines start below the top drop; body lines start at the top.
    expect(result.pages[0].lines[0].y).toBe(80);
    expect(result.pages[0].lines[1].y).toBe(100);
    expect(result.pages[1].lines[0].y).toBe(0);
  });

  it("opens each chapter on a recto and inserts a blank verso where needed", () => {
    // Chapter A: heading + 4 paras = 5 lines -> exactly one opener page.
    // Chapter B: heading + 6 paras = 7 lines -> opener (5) + body (2).
    const result = paginate(doc([chapter(0, 4), chapter(1, 6)]), design, measurer);
    expect(result.pages.map((p) => p.kind)).toEqual(["opener", "blank", "opener", "body"]);
    expect(result.pages.map((p) => p.side)).toEqual(["recto", "verso", "recto", "verso"]);
    expect(result.pages.map((p) => p.chapterIndex)).toEqual([0, -1, 1, 1]);
    // Every opener lands on a recto.
    for (const page of result.pages) {
      if (page.kind === "opener") expect(page.side).toBe("recto");
    }
    // The blank carries no lines.
    const blank = result.pages[1];
    expect(blank.chapterIndex).toBe(-1);
    expect(blank.lines).toHaveLength(0);
  });

  it("allows an opener on a verso when startRecto is off (no blank inserted)", () => {
    const noRecto = { ...design, chapterOpening: { topDropPt: 60, startRecto: false } };
    const result = paginate(doc([chapter(0, 4), chapter(1, 6)]), noRecto, measurer);
    expect(result.pages.map((p) => p.kind)).toEqual(["opener", "opener", "body"]);
    expect(result.pages[1].side).toBe("verso");
    expect(result.pages.every((p) => p.kind !== "blank")).toBe(true);
  });

  it("skips chapters with no kept flowable text (no blank opener pages)", () => {
    const empty: Chapter = {
      id: "front",
      title: "Cover",
      order: 0,
      blocks: [{ type: "image", keptOrDropped: "dropped", dropReason: "image" }],
    };
    const result = paginate(doc([empty, chapter(1, 4)]), design, measurer);
    expect(result.pageCount).toBe(1);
    expect(result.pages[0].chapterIndex).toBe(1);
  });
});
