import { describe, it, expect } from "vitest";
import type { Block, Chapter, Document } from "../model/document";
import type { Page, PaginationResult } from "./types";
import { DEFAULT_DESIGN } from "./defaultDesign";
import { SyntheticMeasurer } from "./measurer";
import { paginate } from "./paginate";
import { clampMargins } from "../ui/design/designPatch";
import {
  DEFAULT_BOUNDS,
  ladderCandidates,
  sheetsForPages,
  statsForResult,
  type PassStats,
  type SolveOutcome,
} from "./budget";
import { runSolve, MAX_SOLVE_PASSES, type LastPass, type SolveTransport } from "./solve";

const measurer = new SyntheticMeasurer();

function chapter(order: number, paras: number): Chapter {
  const blocks: Block[] = [
    { type: "heading", keptOrDropped: "kept", level: 1, text: `Chapter ${order}` },
  ];
  for (let i = 0; i < paras; i++) {
    blocks.push({
      type: "paragraph",
      keptOrDropped: "kept",
      text:
        "The quick brown fox jumps over the lazy dog and keeps on running through the meadow. " +
        "It pauses at the old stone wall, listens to the wind in the aspens, and moves on.",
    });
  }
  return { id: `c${order}`, title: `Chapter ${order}`, order, blocks };
}

const doc: Document = {
  title: "Book",
  author: "Author",
  language: "en",
  chapters: Array.from({ length: 6 }, (_, i) => chapter(i, 80)),
  source: { name: "book", byteLength: 0 },
};

interface Posted {
  progress: { estimate: number; firstPages: Page[] }[];
  done: { result: PaginationResult; wordCount: number; stats: PassStats; solve: SolveOutcome }[];
}

/**
 * A fake solve transport. The clock advances 13ms per read so the slicing
 * yield runs on every generator step, giving `staleAfterYields` a precise
 * cancellation point inside a count.
 */
function fakeTransport(staleAfterYields = Infinity) {
  const posted: Posted = { progress: [], done: [] };
  let yields = 0;
  let t = 0;
  const transport: SolveTransport = {
    isStale: () => yields >= staleAfterYields,
    postProgress: (estimate, firstPages) => posted.progress.push({ estimate, firstPages }),
    postDone: (result, wordCount, stats, solve) =>
      posted.done.push({ result, wordCount, stats, solve }),
    yieldToLoop: async () => {
      yields++;
    },
    now: () => (t += 13),
  };
  return { transport, posted };
}

/** A settled base pass, as the worker would retain after the first paginate. */
function settledBase(): LastPass {
  const result = paginate(doc, DEFAULT_DESIGN, measurer);
  return { design: DEFAULT_DESIGN, result, wordCount: 1000, stats: statsForResult(result) };
}

const base = settledBase();
const candidates = ladderCandidates(DEFAULT_DESIGN, DEFAULT_BOUNDS);
const denseExact = sheetsForPages(paginate(doc, candidates[0], measurer).pageCount);
const roomyExact = sheetsForPages(
  paginate(doc, candidates[candidates.length - 1], measurer).pageCount,
);

async function solve(targetSheets: number, lastPass: LastPass | null = base) {
  const { transport, posted } = fakeTransport();
  const retained = await runSolve(
    doc,
    { targetSheets, base: DEFAULT_DESIGN, bounds: DEFAULT_BOUNDS },
    measurer,
    transport,
    lastPass,
  );
  return { posted, retained };
}

describe("runSolve", () => {
  it("has a fixture whose ladder spans a real sheet range", () => {
    expect(denseExact).toBeGreaterThan(2);
    expect(roomyExact).toBeGreaterThan(denseExact + 4);
  });

  it("applies a design within one sheet of an in-range target, marked hit, within the pass budget", async () => {
    const target = Math.round((denseExact + roomyExact) / 2);
    const { posted } = await solve(target);

    expect(posted.done).toHaveLength(1);
    const { solve: outcome, result } = posted.done[0];
    expect(outcome.achieved).toBe("hit");
    expect(Math.abs(outcome.sheets - target)).toBeLessThanOrEqual(1);
    expect(outcome.passes).toBeLessThanOrEqual(MAX_SOLVE_PASSES);
    // Exact numbers only: the reported sheets are the applied result's own.
    expect(outcome.sheets).toBe(sheetsForPages(result.pageCount));
  });

  it("carries stats on done that match the result's own pages", async () => {
    const target = Math.round((denseExact + roomyExact) / 2);
    const { posted } = await solve(target);
    const { stats, result } = posted.done[0];
    const lines = result.pages.reduce((n, p) => n + p.lines.length, 0);
    expect(stats.totalLines).toBe(lines);
    expect(stats).toEqual(statsForResult(result));
  });

  it("clamps to the densest boundary design with its exact sheets when the target is below reach", async () => {
    const target = Math.max(1, denseExact - 4);
    const { posted } = await solve(target);
    const { solve: outcome } = posted.done[0];
    expect(outcome.achieved).toBe("clamped-dense");
    expect(outcome.sheets).toBe(denseExact);
    expect(outcome.design).toEqual(candidates[0]);
  });

  it("clamps to the roomiest boundary design with its exact sheets when the target is above reach", async () => {
    const target = roomyExact + 4;
    const { posted } = await solve(target);
    const { solve: outcome } = posted.done[0];
    expect(outcome.achieved).toBe("clamped-roomy");
    expect(outcome.sheets).toBe(roomyExact);
    expect(outcome.design).toEqual(candidates[candidates.length - 1]);
  });

  it("never violates the bounds or the engine floors across a target grid", async () => {
    const targets: number[] = [];
    for (let t = Math.max(1, denseExact - 2); t <= roomyExact + 2; t += 2) targets.push(t);
    for (const target of targets) {
      const { posted } = await solve(target);
      expect(posted.done).toHaveLength(1);
      const { solve: outcome } = posted.done[0];
      const d = outcome.design;
      expect(d.font.sizePt).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.fontMinPt);
      expect(d.font.sizePt).toBeLessThanOrEqual(DEFAULT_BOUNDS.fontMaxPt);
      const multiple = d.font.lineHeightPt / d.font.sizePt;
      expect(multiple).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.spacingMin - 0.03);
      expect(multiple).toBeLessThanOrEqual(DEFAULT_BOUNDS.spacingMax + 0.03);
      // Engine floors: clampMargins leaves the winner's margins unchanged.
      expect(clampMargins(d.trim, d.margins)).toEqual(d.margins);
      // Every applied design is a ladder candidate, so counted candidates
      // (a superset containing the winner) respect the same bounds.
      expect(candidates).toContainEqual(d);
    }
  });

  it("abandons a superseded solve mid-count with no further posts", async () => {
    const { transport, posted } = fakeTransport(1);
    const retained = await runSolve(
      doc,
      { targetSheets: denseExact + 2, base: DEFAULT_DESIGN, bounds: DEFAULT_BOUNDS },
      measurer,
      transport,
      base,
    );
    expect(retained).toBeNull();
    expect(posted.done).toHaveLength(0);
  });

  it("replies from the retained result without an engine pass when the target is the current sheet count", async () => {
    const currentSheets = sheetsForPages(base.result.pageCount);
    const { posted, retained } = await solve(currentSheets);
    expect(posted.done).toHaveLength(1);
    // Identity: the retained result itself, not a re-layout.
    expect(posted.done[0].result).toBe(base.result);
    expect(posted.done[0].solve.achieved).toBe("hit");
    expect(posted.done[0].solve.passes).toBe(0);
    expect(posted.progress).toHaveLength(0);
    expect(retained).toBe(base);
  });

  it("streams first pages, then posts the winner through the same done path", async () => {
    const target = Math.round((denseExact + roomyExact) / 2);
    const { posted } = await solve(target);
    expect(posted.progress.length).toBeGreaterThanOrEqual(1);
    expect(posted.progress[0].firstPages.length).toBeGreaterThan(0);
    // The last thing painted before done matches the winning result.
    const lastProgress = posted.progress[posted.progress.length - 1];
    const winner = posted.done[0].result;
    expect(winner.pages.slice(0, lastProgress.firstPages.length)).toEqual(
      lastProgress.firstPages,
    );
  });

  it("counts the base exactly first when no settled pass exists", async () => {
    const target = Math.round((denseExact + roomyExact) / 2);
    const { posted } = await solve(target, null);
    expect(posted.done).toHaveLength(1);
    expect(Math.abs(posted.done[0].solve.sheets - target)).toBeLessThanOrEqual(1);
  });

  it("is deterministic: identical solves yield identical outcomes", async () => {
    const target = denseExact + 2;
    const a = await solve(target);
    const b = await solve(target);
    expect(a.posted.done[0].solve).toEqual(b.posted.done[0].solve);
    expect(a.posted.done[0].result.pageCount).toBe(b.posted.done[0].result.pageCount);
  });
});
