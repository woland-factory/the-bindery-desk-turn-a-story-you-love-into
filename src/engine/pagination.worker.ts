/// <reference lib="webworker" />
import type { Document } from "../model/document";
import type { MainToWorker, WorkerToMain } from "./protocol";
import { createRuntimeMeasurer } from "./offscreenMeasurer";
import { driveEngine, runEngine, type EngineTransport } from "./engine";
import type { Measurer } from "./measurer";
import { ensureFontLoaded } from "./fontFaces";
import { entryForId, entryForStack } from "../fonts/catalog";
import { statsForResult } from "./budget";
import { runSolve, type LastPass, type SolveTransport } from "./solve";

// Worker entry. Holds the parsed Document in memory and re-paginates from a
// `paginate` (a changed design) alone, so a re-flow never re-transfers or
// re-parses the book. Honors latest-wins cancellation: only the most recent
// request's messages reach the main thread.

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let heldDocument: Document | null = null;
let currentRequestId = 0;
let measurer: Measurer | null = null;
// The most recent completed pass (paginate or solve). The solver's predictor
// anchors to it, and a solve targeting the sheets the book already occupies
// replies from it without an engine pass.
let lastPass: LastPass | null = null;

function post(message: WorkerToMain): void {
  ctx.postMessage(message);
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// The default design uses a system serif stack (Georgia, Times, serif) whose
// metrics resolve synchronously, so there is no web font to wait for and the
// default path adds no font work before its first pass. A curated face,
// however, only measures correctly once it is present in the worker's
// FontFaceSet, so we load it (once, cached) before driving the engine. We still
// do NOT gate on `self.fonts.ready`: for the system serif that resolves to a
// no-op, and warming a curated face ahead of the paginate keeps the load off
// the first-feedback path.

ctx.onmessage = async (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  if (msg.type === "load") {
    // Deserializing the message already ingested the book; acknowledge so the
    // client can start the hot path with the worker warm.
    heldDocument = msg.document;
    lastPass = null;
    post({ type: "loaded", requestId: msg.requestId });
    return;
  }

  if (msg.type === "warm-fonts") {
    // Fire and forget: pull the requested faces into the FontFaceSet ahead of
    // a paginate that will need them. No reply, no effect on latest-wins.
    for (const id of msg.fontIds) {
      const entry = entryForId(id);
      if (entry) void ensureFontLoaded(entry);
    }
    return;
  }

  // paginate or solve: both enter the same latest-wins request stream.
  currentRequestId = msg.requestId;
  const requestId = msg.requestId;

  if (!heldDocument) {
    post({ type: "error", requestId, message: "Reload the book to lay it out." });
    return;
  }

  // Load the design's face before measuring. The system serif resolves to a
  // no-op; a warmed curated face resolves from cache; only a cold curated face
  // pays a one-time load. Honor latest-wins after the await.
  const family = msg.type === "solve" ? msg.base.font.family : msg.design.font.family;
  await ensureFontLoaded(entryForStack(family));
  if (requestId !== currentRequestId) return;

  if (!measurer) measurer = createRuntimeMeasurer();
  const doc = heldDocument;

  if (msg.type === "solve") {
    const transport: SolveTransport = {
      isStale: () => requestId !== currentRequestId,
      postProgress: (estimatedPageCount, firstPages) =>
        post({ type: "progress", requestId, estimatedPageCount, firstPages }),
      postDone: (result, wordCount, stats, solve) =>
        post({ type: "done", requestId, result, wordCount, stats, solve }),
      yieldToLoop: macrotask,
      now: () => performance.now(),
    };
    try {
      const retained = await runSolve(
        doc,
        { targetSheets: msg.targetSheets, base: msg.base, bounds: msg.bounds },
        measurer,
        transport,
        lastPass,
      );
      if (retained) lastPass = retained;
    } catch {
      if (requestId === currentRequestId) {
        post({ type: "error", requestId, message: "The layout stopped before it finished." });
      }
    }
    return;
  }

  const transport: EngineTransport = {
    isStale: () => requestId !== currentRequestId,
    postProgress: (estimatedPageCount, firstPages) =>
      post({ type: "progress", requestId, estimatedPageCount, firstPages }),
    postDone: (result, wordCount) => {
      const stats = statsForResult(result);
      lastPass = { design: msg.design, result, wordCount, stats };
      post({ type: "done", requestId, result, wordCount, stats });
    },
    yieldToLoop: macrotask,
    now: () => performance.now(),
  };

  try {
    await driveEngine(runEngine(doc, msg.design, measurer), transport);
  } catch {
    if (requestId === currentRequestId) {
      post({ type: "error", requestId, message: "The layout stopped before it finished." });
    }
  }
};
