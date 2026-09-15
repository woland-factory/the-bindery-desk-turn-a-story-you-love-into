import type { Document } from "../model/document";
import type { DesignSpec, Page, PaginationResult, Timings } from "./types";
import type { MainToWorker, WorkerToMain } from "./protocol";

// Main-thread client. Owns one worker for the app's lifetime, sends `load`
// once per book and `paginate` per design, and surfaces streamed results with
// timings measured from each request's dispatch (isolating the engine from
// parse time). Ignores messages from superseded requests (latest-wins).

export interface PaginateHandlers {
  onProgress?: (estimatedPageCount: number, firstPages: Page[], firstFeedbackMs: number) => void;
  onDone?: (result: PaginationResult, timings: Timings) => void;
  onError?: (message: string) => void;
}

/** Global hook the preview and the perf harness read the latest timings from. */
export const TIMINGS_HOOK = "__BINDERY_ENGINE_TIMINGS__";

interface ActiveRequest {
  id: number;
  dispatchTs: number;
  gotFirst: boolean;
  firstFeedbackMs?: number;
  handlers: PaginateHandlers;
}

export interface EngineClientLike {
  load(doc: Document): void;
  paginate(design: DesignSpec, handlers: PaginateHandlers): void;
  /** Optional: pre-load curated faces in the worker ahead of a paginate. */
  warmFonts?(fontIds: string[]): void;
  dispose(): void;
}

export class EngineClient implements EngineClientLike {
  private worker: Worker;
  private nextId = 1;
  private active: ActiveRequest | null = null;
  private loaded = false;
  // A paginate requested before the book finished loading waits here, so its
  // timing measures the engine rather than the one-time book ingest.
  private queued: { design: DesignSpec; handlers: PaginateHandlers } | null = null;

  constructor() {
    this.worker = new Worker(new URL("./pagination.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<WorkerToMain>) => this.onMessage(event.data);
  }

  load(doc: Document): void {
    this.loaded = false;
    this.send({ type: "load", requestId: this.nextId++, document: doc });
  }

  paginate(design: DesignSpec, handlers: PaginateHandlers): void {
    if (!this.loaded) {
      this.queued = { design, handlers };
      return;
    }
    this.dispatchPaginate(design, handlers);
  }

  warmFonts(fontIds: string[]): void {
    if (fontIds.length === 0) return;
    this.send({ type: "warm-fonts", fontIds });
  }

  dispose(): void {
    this.worker.onmessage = null;
    this.worker.terminate();
    this.active = null;
    this.queued = null;
  }

  private dispatchPaginate(design: DesignSpec, handlers: PaginateHandlers): void {
    const id = this.nextId++;
    this.active = { id, dispatchTs: now(), gotFirst: false, handlers };
    this.send({ type: "paginate", requestId: id, design });
  }

  private send(message: MainToWorker): void {
    this.worker.postMessage(message);
  }

  private onMessage(msg: WorkerToMain): void {
    if (msg.type === "loaded") {
      this.loaded = true;
      const queued = this.queued;
      this.queued = null;
      if (queued) this.dispatchPaginate(queued.design, queued.handlers);
      return;
    }

    const active = this.active;
    if (!active || msg.requestId !== active.id) return; // superseded or unknown

    if (msg.type === "progress") {
      const firstFeedbackMs = now() - active.dispatchTs;
      if (!active.gotFirst) {
        active.gotFirst = true;
        active.firstFeedbackMs = firstFeedbackMs;
      }
      active.handlers.onProgress?.(msg.estimatedPageCount, msg.firstPages, firstFeedbackMs);
      return;
    }
    if (msg.type === "done") {
      const settleMs = now() - active.dispatchTs;
      const timings: Timings = {
        wordCount: msg.wordCount,
        pageCount: msg.result.pageCount,
        firstFeedbackMs: active.firstFeedbackMs ?? settleMs,
        settleMs,
      };
      publishTimings(timings);
      active.handlers.onDone?.(msg.result, timings);
      this.active = null;
      return;
    }
    // error
    active.handlers.onError?.(msg.message);
    this.active = null;
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function publishTimings(timings: Timings): void {
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>)[TIMINGS_HOOK] = timings;
  }
}
