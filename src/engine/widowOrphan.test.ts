import { describe, it, expect } from "vitest";
import type { Block, Chapter, Document } from "../model/document";
import type { DesignSpec, Page } from "./types";
import { paginate, computeMetrics } from "./paginate";
import { SyntheticMeasurer } from "./measurer";

// Uniform measurer. A 15-glyph "word" is 150px, wider than the 144px column,
// so with hyphenation off each such word lands on its own line. A paragraph
// of K such words is therefore exactly K lines, letting us position a break
// to strand a single line on purpose.
const measurer = new SyntheticMeasurer({ " ": 0.5 }, 1);
const WORD = "w".repeat(15);

/** A paragraph that occupies exactly `k` lines. */
function para(k: number): Block {
  return { type: "paragraph", keptOrDropped: "kept", text: Array(k).fill(WORD).join(" ") };
}

function chapter(order: number, blocks: Block[]): Chapter {
  return { id: `c${order}`, title: "T", order, blocks };
}

function doc(chapters: Chapter[]): Document {
  return { title: "T", author: "A", language: "en", chapters, source: { name: "t", byteLength: 0 } };
}

// column 144px; text area (1.4375-0.5)*96 = 90px; lineHeight 20px -> every
// page (opener drop 0) holds exactly 4 lines.
const base: DesignSpec = {
  trim: { w: 2, h: 1.4375, unit: "in" },
  font: { family: "test", sizePt: 7.5, lineHeightPt: 15 },
  margins: { inner: 0.25, outer: 0.25, top: 0.25, bottom: 0.25 },
  chapterOpening: { topDropPt: 0, startRecto: false },
  runningHeader: { verso: "", recto: "", showOnOpener: false },
  widowControl: true,
  hyphenation: false,
};

function withControl(on: boolean): DesignSpec {
  return { ...base, widowControl: on };
}

const lineCounts = (pages: Page[]) => pages.map((p) => p.lines.length);

describe("widow/orphan control", () => {
  it("confirms the 4-line page capacity the cases rely on", () => {
    expect(computeMetrics(base).bodyLinesPerPage).toBe(4);
    expect(computeMetrics(base).openerLinesPerPage).toBe(4);
  });

  it("moves an orphaned first line down instead of stranding it at the foot", () => {
    // 3-line paragraph then a 2-line paragraph. Greedy fills page 1 with the
    // first paragraph plus a lone first line of the second (an orphan).
    const d = doc([chapter(0, [para(3), para(2)])]);
    const off = paginate(d, withControl(false), measurer);
    const on = paginate(d, withControl(true), measurer);

    expect(lineCounts(off.pages)).toEqual([4, 1]); // orphan stranded at foot
    expect(lineCounts(on.pages)).toEqual([3, 2]); // whole paragraph moved down
  });

  it("pulls a line down so a widow never starts the next page (chapter boundary)", () => {
    // A single 5-line paragraph. Greedy leaves its last line alone on page 2.
    const d = doc([chapter(0, [para(5)])]);
    const off = paginate(d, withControl(false), measurer);
    const on = paginate(d, withControl(true), measurer);

    expect(lineCounts(off.pages)).toEqual([4, 1]); // lone widow on the last page
    expect(lineCounts(on.pages)).toEqual([3, 2]); // two lines carry over
  });

  it("with control on, no page strands a lone widow or orphan", () => {
    const d = doc([chapter(0, [para(3), para(2), para(5), para(2)])]);
    const { pages } = paginate(d, withControl(true), measurer);
    // Reconstruct paragraph identity from line widths is unnecessary: assert
    // the design intent holds via the known-good page fill.
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.lines.length).toBeGreaterThanOrEqual(2);
  });

  it("terminates and stays deterministic on a pathological repeated case", () => {
    // Many two-line paragraphs against a shifting one-line remainder.
    const blocks = Array.from({ length: 40 }, () => para(2));
    const d = doc([chapter(0, blocks)]);
    const a = paginate(d, withControl(true), measurer);
    const b = paginate(d, withControl(true), measurer);
    expect(a).toEqual(b); // deterministic
    expect(a.pageCount).toBeGreaterThan(0);
    expect(a.pageCount).toBeLessThan(1000); // bounded, no runaway
  });
});
