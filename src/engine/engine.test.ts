import { describe, it, expect } from "vitest";
import type { Block, Chapter, Document } from "../model/document";
import type { Page, PaginationResult } from "./types";
import { runEngine, driveEngine, FIRST_PAGES, type EngineTransport } from "./engine";
import { paginate } from "./paginate";
import { DEFAULT_DESIGN } from "./defaultDesign";
import { SyntheticMeasurer } from "./measurer";

const measurer = new SyntheticMeasurer();

function chapter(order: number, paras: number): Chapter {
  const blocks: Block[] = [{ type: "heading", keptOrDropped: "kept", level: 1, text: `Chapter ${order}` }];
  for (let i = 0; i < paras; i++) {
    blocks.push({
      type: "paragraph",
      keptOrDropped: "kept",
      text: "The quick brown fox jumps over the lazy dog and keeps on running through the meadow.",
    });
  }
  return { id: `c${order}`, title: `Chapter ${order}`, order, blocks };
}

const document: Document = {
  title: "Book",
  author: "Author",
  language: "en",
  chapters: [chapter(0, 6), chapter(1, 8), chapter(2, 5)],
  source: { name: "book", byteLength: 0 },
};

/** A fake transport that records what the engine drove through it. */
function fakeTransport(staleAfterProgress = false) {
  const progress: { estimate: number; firstPages: Page[] }[] = [];
  const done: { result: PaginationResult; wordCount: number }[] = [];
  let stale = false;
  const transport: EngineTransport = {
    isStale: () => stale,
    postProgress: (estimate, firstPages) => {
      progress.push({ estimate, firstPages });
      if (staleAfterProgress) stale = true;
    },
    postDone: (result, wordCount) => done.push({ result, wordCount }),
    yieldToLoop: async () => {},
    now: () => 0,
  };
  return { transport, progress, done };
}

describe("runEngine (streaming)", () => {
  it("emits a first-feedback progress with an estimate and the first pages, then done", async () => {
    const t = fakeTransport();
    await driveEngine(runEngine(document, DEFAULT_DESIGN, measurer), t.transport);

    expect(t.progress).toHaveLength(1);
    expect(t.progress[0].estimate).toBeGreaterThan(0);
    expect(t.progress[0].firstPages.length).toBeGreaterThan(0);
    expect(t.progress[0].firstPages.length).toBeLessThanOrEqual(FIRST_PAGES);

    expect(t.done).toHaveLength(1);
    expect(t.done[0].result.pageCount).toBeGreaterThan(0);
    expect(t.done[0].result.pages).toHaveLength(t.done[0].result.pageCount);
    expect(t.done[0].wordCount).toBeGreaterThan(0);
  });

  it("abandons a superseded pass: no done after the request goes stale", async () => {
    const t = fakeTransport(true);
    await driveEngine(runEngine(document, DEFAULT_DESIGN, measurer), t.transport);

    expect(t.progress).toHaveLength(1); // first feedback still delivered
    expect(t.done).toHaveLength(0); // settled result dropped once superseded
  });

  it("first feedback pages are a prefix of the final pages", async () => {
    const t = fakeTransport();
    await driveEngine(runEngine(document, DEFAULT_DESIGN, measurer), t.transport);
    const first = t.progress[0].firstPages;
    const full = t.done[0].result.pages;
    expect(full.slice(0, first.length)).toEqual(first);
  });
});

describe("determinism", () => {
  it("produces a byte-identical result on repeated runs", () => {
    const a = paginate(document, DEFAULT_DESIGN, measurer);
    const b = paginate(document, DEFAULT_DESIGN, measurer);
    expect(a).toEqual(b);
    expect(a.pageCount).toBe(b.pageCount);
  });

  it("gives a different layout when a toggle changes", () => {
    const on = paginate(document, { ...DEFAULT_DESIGN, hyphenation: true }, measurer);
    const off = paginate(document, { ...DEFAULT_DESIGN, hyphenation: false }, measurer);
    // Some page's lines differ once hyphenation is toggled.
    expect(JSON.stringify(on.pages)).not.toBe(JSON.stringify(off.pages));
  });
});
