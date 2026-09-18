import type { DesignSpec, PaginationResult } from "../engine/types";
import type { ImpositionOptions } from "./impose";
import type { DocMeta, ExportPhase, ExportRequest, ExportToMain } from "./protocol";

// Main-thread export client. Owns one export worker (created lazily on the first
// export), assigns each request a monotonic id, forwards progress, and resolves
// the active request on done. Latest-wins: a newer request supersedes an
// in-flight one, and the stale worker reply is dropped. Mirrors the engine
// client's conventions so the preview drives both the same way.

/** Everything an export needs except the id the client assigns. */
export interface ExportInput {
  result: PaginationResult;
  design: DesignSpec;
  docMeta: DocMeta;
  imposition: ImpositionOptions;
}

export interface ExportHandlers {
  onProgress?: (phase: ExportPhase, done: number, total: number) => void;
  onDone?: (typeset: ArrayBuffer, signatures: ArrayBuffer) => void;
  onError?: (message: string) => void;
}

/** The minimal worker surface the client uses, so tests can inject a fake. */
export interface WorkerLike {
  postMessage(message: ExportRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: ExportToMain }) => void) | null;
}

export interface ExportClientLike {
  export(input: ExportInput, handlers: ExportHandlers): void;
  dispose(): void;
}

export class ExportClient implements ExportClientLike {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private active: { id: number; handlers: ExportHandlers } | null = null;

  constructor(private readonly createWorker: () => WorkerLike = defaultCreateWorker) {}

  export(input: ExportInput, handlers: ExportHandlers): void {
    const worker = this.ensure();
    const id = this.nextId++;
    this.active = { id, handlers };
    worker.postMessage({ requestId: id, ...input });
  }

  dispose(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.active = null;
  }

  private ensure(): WorkerLike {
    if (!this.worker) {
      this.worker = this.createWorker();
      this.worker.onmessage = (event) => this.onMessage(event.data);
    }
    return this.worker;
  }

  private onMessage(msg: ExportToMain): void {
    const active = this.active;
    if (!active || msg.requestId !== active.id) return; // superseded or unknown
    if (msg.type === "progress") {
      active.handlers.onProgress?.(msg.phase, msg.done, msg.total);
      return;
    }
    if (msg.type === "done") {
      active.handlers.onDone?.(msg.typeset, msg.signatures);
      this.active = null;
      return;
    }
    active.handlers.onError?.(msg.message);
    this.active = null;
  }
}

function defaultCreateWorker(): WorkerLike {
  return new Worker(new URL("./export.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}
