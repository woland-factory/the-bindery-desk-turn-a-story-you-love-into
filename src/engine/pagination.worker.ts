/// <reference lib="webworker" />
import type { Document } from "../model/document";
import type { MainToWorker, WorkerToMain } from "./protocol";
import { createRuntimeMeasurer } from "./offscreenMeasurer";
import { driveEngine, runEngine, type EngineTransport } from "./engine";
import type { Measurer } from "./measurer";

// Worker entry. Holds the parsed Document in memory and re-paginates from a
// `paginate` (a changed design) alone, so a re-flow never re-transfers or
// re-parses the book. Honors latest-wins cancellation: only the most recent
// request's messages reach the main thread.

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let heldDocument: Document | null = null;
let currentRequestId = 0;
let measurer: Measurer | null = null;
let fontsReady = false;

function post(message: WorkerToMain): void {
  ctx.postMessage(message);
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

ctx.onmessage = async (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  if (msg.type === "load") {
    heldDocument = msg.document;
    return;
  }

  // paginate
  currentRequestId = msg.requestId;
  const requestId = msg.requestId;

  if (!heldDocument) {
    post({ type: "error", requestId, message: "Reload the book to lay it out." });
    return;
  }

  // Await the intended font once so measureText uses it, not a mid-load
  // fallback. A newer request during the await supersedes this one.
  if (!fontsReady && "fonts" in ctx && ctx.fonts?.ready) {
    try {
      await ctx.fonts.ready;
    } catch {
      // Fonts are best-effort; measurement still runs with system metrics.
    }
    fontsReady = true;
    if (requestId !== currentRequestId) return;
  }

  if (!measurer) measurer = createRuntimeMeasurer();
  const doc = heldDocument;

  const transport: EngineTransport = {
    isStale: () => requestId !== currentRequestId,
    postProgress: (estimatedPageCount, firstPages) =>
      post({ type: "progress", requestId, estimatedPageCount, firstPages }),
    postDone: (result, wordCount) => post({ type: "done", requestId, result, wordCount }),
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
