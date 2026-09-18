import { describe, it, expect, vi } from "vitest";
import type { DesignSpec } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { ExportClient, type ExportInput, type WorkerLike } from "./client";
import { DEFAULT_IMPOSITION } from "./impose";
import type { ExportRequest, ExportToMain } from "./protocol";

function input(design: DesignSpec = DEFAULT_DESIGN): ExportInput {
  return {
    result: { pageCount: 4, pages: [] },
    design,
    docMeta: { title: "Windermere", author: "A. Author", chapterTitles: {} },
    imposition: DEFAULT_IMPOSITION,
  };
}

/** A controllable fake worker: records requests and lets a test push replies. */
function fakeWorker() {
  const requests: ExportRequest[] = [];
  const worker: WorkerLike = {
    postMessage: (msg) => requests.push(msg),
    terminate: vi.fn(),
    onmessage: null,
  };
  return {
    worker,
    requests,
    reply: (msg: ExportToMain) => worker.onmessage?.({ data: msg }),
    terminate: worker.terminate as ReturnType<typeof vi.fn>,
  };
}

describe("ExportClient", () => {
  it("drives both phases and resolves with two byte buffers", () => {
    const f = fakeWorker();
    const client = new ExportClient(() => f.worker);
    const phases: string[] = [];
    let done: { t: ArrayBuffer; s: ArrayBuffer } | null = null;
    client.export(input(), {
      onProgress: (phase) => phases.push(phase),
      onDone: (t, s) => (done = { t, s }),
    });

    const id = f.requests[0].requestId;
    f.reply({ type: "progress", requestId: id, phase: "typeset", done: 50, total: 100 });
    f.reply({ type: "progress", requestId: id, phase: "impose", done: 2, total: 4 });
    f.reply({ type: "done", requestId: id, typeset: new ArrayBuffer(8), signatures: new ArrayBuffer(4) });

    expect(phases).toEqual(["typeset", "impose"]);
    expect(done).not.toBeNull();
    expect(done!.t.byteLength).toBe(8);
    expect(done!.s.byteLength).toBe(4);
  });

  it("reports monotonic progress within a phase", () => {
    const f = fakeWorker();
    const client = new ExportClient(() => f.worker);
    const dones: number[] = [];
    client.export(input(), { onProgress: (_phase, doneN) => dones.push(doneN) });
    const id = f.requests[0].requestId;
    f.reply({ type: "progress", requestId: id, phase: "typeset", done: 50, total: 200 });
    f.reply({ type: "progress", requestId: id, phase: "typeset", done: 100, total: 200 });
    expect(dones).toEqual([50, 100]);
  });

  it("supersedes an in-flight export and drops the stale done", () => {
    const f = fakeWorker();
    const client = new ExportClient(() => f.worker);
    const first = vi.fn();
    const second = vi.fn();
    client.export(input(), { onDone: first });
    const staleId = f.requests[0].requestId;
    client.export(input(), { onDone: second });
    const freshId = f.requests[1].requestId;
    expect(freshId).toBeGreaterThan(staleId);

    // A late done for the superseded request is ignored.
    f.reply({ type: "done", requestId: staleId, typeset: new ArrayBuffer(1), signatures: new ArrayBuffer(1) });
    expect(first).not.toHaveBeenCalled();
    // The fresh request still resolves.
    f.reply({ type: "done", requestId: freshId, typeset: new ArrayBuffer(2), signatures: new ArrayBuffer(2) });
    expect(second).toHaveBeenCalledOnce();
  });

  it("surfaces a product-voice error message", () => {
    const f = fakeWorker();
    const client = new ExportClient(() => f.worker);
    let message = "";
    client.export(input(), { onError: (m) => (message = m) });
    const id = f.requests[0].requestId;
    f.reply({ type: "error", requestId: id, message: "The export stopped before it finished. Try again." });
    expect(message).toBe("The export stopped before it finished. Try again.");
    expect(message).not.toMatch(/[—–]/);
    expect(message).not.toMatch(/Unable to|Something went wrong/i);
  });

  it("reuses one worker across exports and terminates it on dispose", () => {
    const f = fakeWorker();
    const create = vi.fn(() => f.worker);
    const client = new ExportClient(create);
    client.export(input(), {});
    client.export(input(), {});
    expect(create).toHaveBeenCalledOnce();
    client.dispose();
    expect(f.terminate).toHaveBeenCalledOnce();
  });
});
