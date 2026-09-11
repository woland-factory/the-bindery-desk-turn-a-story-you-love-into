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

function post(message: WorkerToMain): void {
  ctx.postMessage(message);
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// This EPIC's default design uses a system serif stack (Georgia, Times, serif)
// whose metrics resolve synchronously, so there is no web font to wait for.
// We deliberately do NOT gate the pass on `self.fonts.ready`: it does not
// resolve in a dedicated worker in some engines, and any wait would push first
// feedback past the 100ms budget. A later EPIC that embeds custom fonts warms
// them before measuring instead of blocking the first pass.

ctx.onmessage = async (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  if (msg.type === "load") {
    // Deserializing the message already ingested the book; acknowledge so the
    // client can start the hot path with the worker warm.
    heldDocument = msg.document;
    post({ type: "loaded", requestId: msg.requestId });
    return;
  }

  // paginate
  currentRequestId = msg.requestId;
  const requestId = msg.requestId;

  if (!heldDocument) {
    post({ type: "error", requestId, message: "Reload the book to lay it out." });
    return;
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
