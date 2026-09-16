import type { Document } from "../model/document";
import type { DesignSpec, Page, PaginationResult } from "./types";
import type { Measurer } from "./measurer";
import { FIRST_PAGES, runEngine } from "./engine";
import { computeMetrics } from "./paginate";
import {
  ladderCandidates,
  sheetsForPages,
  statsForResult,
  type BudgetBounds,
  type PassRef,
  type PassStats,
  type SolveOutcome,
} from "./budget";

// Worker-side paper-budget solve: a deterministic search over the density
// ladder. The predictor narrows the ladder to a working candidate, a bounded
// number of exact engine counts verify and correct, and the winner's already
// assembled result is posted (never re-laid-out). Slicing and staleness follow
// the same rules as driveEngine, with stale checks inside every count so a
// superseded drag dies promptly.

export interface SolveRequest {
  targetSheets: number;
  base: DesignSpec;
  bounds: BudgetBounds;
}

/** The retained result of the worker's most recent completed pass. */
export interface LastPass {
  design: DesignSpec;
  result: PaginationResult;
  wordCount: number;
  stats: PassStats;
}

export interface SolveTransport {
  /** True once this request has been superseded by a newer one. */
  isStale(): boolean;
  postProgress(estimatedPageCount: number, firstPages: Page[]): void;
  postDone(result: PaginationResult, wordCount: number, stats: PassStats, solve: SolveOutcome): void;
  /** Yield to the event loop so queued messages (a newer request) are seen. */
  yieldToLoop(): Promise<void>;
  now(): number;
}

/** A settled result is within one sheet of the target. */
export const SHEET_TOLERANCE = 1;
/** Ceiling on exact engine counts per solve; the budget that keeps 300k words ~2s. */
export const MAX_SOLVE_PASSES = 3;
/** Work between event-loop yields, in ms. Matches driveEngine's cadence. */
const SLICE_MS = 12;

interface Counted {
  result: PaginationResult;
  wordCount: number;
  stats: PassStats;
  sheets: number;
}

/**
 * Run one solve. Returns the pass to retain as the worker's last completed
 * pass, or null when the request went stale (nothing was posted after that).
 */
export async function runSolve(
  doc: Document,
  request: SolveRequest,
  measurer: Measurer,
  transport: SolveTransport,
  lastPass: LastPass | null,
): Promise<LastPass | null> {
  const target = request.targetSheets;

  // Dragging to where the book already sits never redesigns it: the retained
  // pass IS the mounted design, so reply from it without an engine pass.
  if (lastPass && sheetsForPages(lastPass.result.pageCount) === target) {
    transport.postDone(lastPass.result, lastPass.wordCount, lastPass.stats, {
      targetSheets: target,
      sheets: sheetsForPages(lastPass.result.pageCount),
      design: lastPass.design,
      achieved: "hit",
      passes: 0,
    });
    return lastPass;
  }

  let passes = 0;
  let streamedIdx = -1; // ladder index whose first pages already reached main
  let streamedAny = false;

  // Drain one exact pass. Forwards the first progress event of the whole
  // solve (the sub-100ms streamed feedback); every later candidate counts
  // silently. Returns null when superseded mid-count.
  const countPass = async (design: DesignSpec, ladderIdx: number): Promise<Counted | null> => {
    let lastYield = transport.now();
    for (const ev of runEngine(doc, design, measurer)) {
      if (transport.isStale()) return null;
      if (ev.type === "progress") {
        if (!streamedAny) {
          streamedAny = true;
          streamedIdx = ladderIdx;
          transport.postProgress(ev.estimatedPageCount, ev.firstPages);
        }
      } else if (ev.type === "done") {
        passes++;
        return {
          result: ev.result,
          wordCount: ev.wordCount,
          stats: statsForResult(ev.result),
          sheets: sheetsForPages(ev.result.pageCount),
        };
      }
      if (transport.now() - lastYield > SLICE_MS) {
        await transport.yieldToLoop();
        if (transport.isStale()) return null;
        lastYield = transport.now();
      }
    }
    return null;
  };

  // Reference stats for the predictor: the retained last pass, or (defensive;
  // the UI gates the slider on first settle) one exact count of the base.
  let ref: PassRef;
  if (lastPass) {
    ref = { design: lastPass.design, pageCount: lastPass.result.pageCount, stats: lastPass.stats };
  } else {
    const baseCount = await countPass(request.base, -1);
    if (!baseCount) return null;
    ref = { design: request.base, pageCount: baseCount.result.pageCount, stats: baseCount.stats };
  }

  const candidates = ladderCandidates(request.base, request.bounds);
  const counted = new Map<number, Counted>();

  // Per-candidate geometry, computed once; predictions across the (large)
  // ladder then cost a few flops each, so every re-pick stays sub-millisecond.
  const candMetrics = candidates.map((c) => computeMetrics(c));
  let refMetrics = computeMetrics(ref.design);
  const predictAt = (idx: number): number => {
    const cm = candMetrics[idx];
    const candLines =
      ref.stats.totalLines *
      (candidates[idx].font.sizePt / ref.design.font.sizePt) *
      (refMetrics.columnPx / cm.columnPx);
    const overhead = ref.pageCount - Math.ceil(ref.stats.totalLines / refMetrics.bodyLinesPerPage);
    return Math.max(1, Math.ceil(candLines / cm.bodyLinesPerPage) + overhead);
  };

  // Sheets for a candidate: exact when counted, predicted otherwise.
  const sheetsAt = (idx: number): number => counted.get(idx)?.sheets ?? sheetsForPages(predictAt(idx));

  // Pick the candidate to evaluate for `target`. Beyond the ends the boundary
  // wins; inside, the best by |sheets - target|, ties preferring sheets <=
  // target (fits the paper the binder has), then the roomier design.
  const pick = (): number => {
    const last = candidates.length - 1;
    if (target < sheetsAt(0)) return 0;
    if (target > sheetsAt(last)) return last;
    let best = 0;
    let bestSheets = sheetsAt(0);
    for (let i = 1; i <= last; i++) {
      const sheets = sheetsAt(i);
      if (better(sheets, i, bestSheets, best, target)) {
        best = i;
        bestSheets = sheets;
      }
    }
    return best;
  };

  // The next candidate worth an exact count, or null when nothing new could
  // beat the best real result. Three deterministic refinements, in order:
  // interpolate inside a counted pair that brackets the target (sheet count
  // is near-linear in ladder index locally), then the predictor's fresh
  // pick, then one ladder step from the best count toward the target.
  const nextCandidate = (bestIdx: number): number | null => {
    let lo: [number, number] | null = null; // [idx, sheets], largest sheets <= target
    let hi: [number, number] | null = null; // [idx, sheets], smallest sheets >= target
    for (const [idx, c] of counted) {
      if (c.sheets <= target && (!lo || c.sheets > lo[1] || (c.sheets === lo[1] && idx > lo[0])))
        lo = [idx, c.sheets];
      if (c.sheets >= target && (!hi || c.sheets < hi[1] || (c.sheets === hi[1] && idx < hi[0])))
        hi = [idx, c.sheets];
    }
    if (lo && hi && hi[1] > lo[1]) {
      const k = Math.round(lo[0] + ((target - lo[1]) * (hi[0] - lo[0])) / (hi[1] - lo[1]));
      const clamped = Math.max(0, Math.min(candidates.length - 1, k));
      if (!counted.has(clamped)) return clamped;
    } else if (counted.size >= 2) {
      // No bracket yet: secant-extrapolate through the two counted points
      // with distinct sheet counts, so a plateau of equal counts is escaped
      // in the target's direction instead of re-sampled.
      const points = [...counted.entries()]
        .map(([idx, c]) => [idx, c.sheets] as [number, number])
        .sort((a, z) => Math.abs(a[1] - target) - Math.abs(z[1] - target) || a[0] - z[0]);
      const near = points[0];
      const other = points.find((p) => p[1] !== near[1]);
      if (other) {
        const k = Math.round(near[0] + ((target - near[1]) * (other[0] - near[0])) / (other[1] - near[1]));
        const clamped = Math.max(0, Math.min(candidates.length - 1, k));
        if (!counted.has(clamped)) return clamped;
      }
    }
    const repick = pick();
    if (!counted.has(repick)) return repick;
    const dir = (counted.get(bestIdx) as Counted).sheets > target ? -1 : 1;
    const step = bestIdx + dir;
    if (step >= 0 && step < candidates.length && !counted.has(step)) return step;
    return null;
  };

  let working = pick();
  for (;;) {
    if (!counted.has(working)) {
      const count = await countPass(candidates[working], working);
      if (!count) return null; // superseded mid-count
      counted.set(working, count);
      // Re-anchor the predictor to the freshest exact count.
      ref = { design: candidates[working], pageCount: count.result.pageCount, stats: count.stats };
      refMetrics = candMetrics[working];
    }
    const bestIdx = bestCountedIndex(counted, target);
    if (Math.abs((counted.get(bestIdx) as Counted).sheets - target) <= SHEET_TOLERANCE) break;
    if (passes >= MAX_SOLVE_PASSES) break;
    const next = nextCandidate(bestIdx);
    if (next == null) break; // the correction names nothing new
    working = next;
  }

  const winnerIdx = bestCountedIndex(counted, target);
  const winner = counted.get(winnerIdx) as Counted;
  const winnerDesign = candidates[winnerIdx];

  let achieved: SolveOutcome["achieved"];
  if (Math.abs(winner.sheets - target) <= SHEET_TOLERANCE) achieved = "hit";
  else if (winnerIdx === 0 && winner.sheets > target) achieved = "clamped-dense";
  else if (winnerIdx === candidates.length - 1 && winner.sheets < target) achieved = "clamped-roomy";
  else achieved = "closest";

  if (transport.isStale()) return null;
  if (winnerIdx !== streamedIdx) {
    // The streamed feedback showed a different candidate; align the preview
    // with the winner before the settled swap. Its pages are already built.
    transport.postProgress(winner.result.pageCount, winner.result.pages.slice(0, FIRST_PAGES));
  }
  transport.postDone(winner.result, winner.wordCount, winner.stats, {
    targetSheets: target,
    sheets: winner.sheets,
    design: winnerDesign,
    achieved,
    passes,
  });
  return {
    design: winnerDesign,
    result: winner.result,
    wordCount: winner.wordCount,
    stats: winner.stats,
  };
}

/** True when candidate (sheets, idx) beats the incumbent for `target`. */
function better(
  sheets: number,
  idx: number,
  bestSheets: number,
  bestIdx: number,
  target: number,
): boolean {
  const diff = Math.abs(sheets - target);
  const bestDiff = Math.abs(bestSheets - target);
  if (diff !== bestDiff) return diff < bestDiff;
  const fits = sheets <= target;
  const bestFits = bestSheets <= target;
  if (fits !== bestFits) return fits;
  return idx > bestIdx; // roomier design wins the final tie
}

function bestCountedIndex(counted: Map<number, Counted>, target: number): number {
  let bestIdx = -1;
  let bestSheets = 0;
  for (const [idx, c] of counted) {
    if (bestIdx === -1 || better(c.sheets, idx, bestSheets, bestIdx, target)) {
      bestIdx = idx;
      bestSheets = c.sheets;
    }
  }
  return bestIdx;
}

