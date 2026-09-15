import { describe, it, expect, beforeEach, vi } from "vitest";

// Drives the worker's message handler directly (self.onmessage) with the engine,
// font loader, and catalog mocked, so we can assert the font-before-measure
// ordering and latest-wins after the font await without a real worker.

const mocks = vi.hoisted(() => {
  const ensureCalls: { resolve: () => void }[] = [];
  return {
    ensureCalls,
    driveEngine: vi.fn(async () => {}),
    runEngine: vi.fn(() => ({})),
    runSolve: vi.fn(async () => null),
    ensureFontLoaded: vi.fn(() => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      ensureCalls.push({ resolve });
      return promise;
    }),
    entryForStack: vi.fn((stack: string) => ({ id: "curated", stack })),
    entryForId: vi.fn((id: string) => ({ id })),
  };
});

vi.mock("./engine", () => ({ driveEngine: mocks.driveEngine, runEngine: mocks.runEngine }));
vi.mock("./solve", () => ({ runSolve: mocks.runSolve }));
vi.mock("./fontFaces", () => ({ ensureFontLoaded: mocks.ensureFontLoaded }));
vi.mock("../fonts/catalog", () => ({
  entryForStack: mocks.entryForStack,
  entryForId: mocks.entryForId,
}));
vi.mock("./offscreenMeasurer", () => ({ createRuntimeMeasurer: () => ({ measure: () => 0 }) }));

import "./pagination.worker";

const worker = self as unknown as {
  onmessage: (event: { data: unknown }) => Promise<void> | void;
  postMessage: (message: unknown) => void;
};

let posts: unknown[] = [];
let nextId = 100;

function dispatch(data: unknown): Promise<void> | void {
  return worker.onmessage({ data });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  posts = [];
  worker.postMessage = (m: unknown) => posts.push(m);
  mocks.driveEngine.mockClear();
  mocks.runSolve.mockClear();
  mocks.ensureFontLoaded.mockClear();
  mocks.entryForId.mockClear();
  mocks.ensureCalls.length = 0;
  await dispatch({ type: "load", requestId: nextId++, document: { chapters: [], language: "en" } });
});

function paginate(family: string): Promise<void> | void {
  return dispatch({ type: "paginate", requestId: nextId++, design: { font: { family } } });
}

describe("pagination worker font wiring", () => {
  it("acknowledges load", () => {
    expect(posts.some((m) => (m as { type: string }).type === "loaded")).toBe(true);
  });

  it("awaits the font load before driving the engine", async () => {
    const p = paginate('"Curated", serif');
    await flush();
    expect(mocks.ensureFontLoaded).toHaveBeenCalledTimes(1);
    expect(mocks.driveEngine).not.toHaveBeenCalled(); // still loading the face

    mocks.ensureCalls[0].resolve();
    await p;
    expect(mocks.driveEngine).toHaveBeenCalledTimes(1);
  });

  it("drops a request superseded during its font load (latest-wins)", async () => {
    const first = paginate('"A", serif');
    await flush();
    const second = paginate('"B", serif');
    await flush();

    // Resolve both font loads; the first request is now stale and must not run.
    mocks.ensureCalls.forEach((c) => c.resolve());
    await Promise.all([first, second]);
    expect(mocks.driveEngine).toHaveBeenCalledTimes(1);
  });

  it("warms requested faces on a warm-fonts message without a paginate", async () => {
    await dispatch({ type: "warm-fonts", fontIds: ["eb-garamond", "lora"] });
    expect(mocks.entryForId).toHaveBeenCalledWith("eb-garamond");
    expect(mocks.entryForId).toHaveBeenCalledWith("lora");
    expect(mocks.ensureFontLoaded).toHaveBeenCalledTimes(2);
    expect(mocks.driveEngine).not.toHaveBeenCalled();
  });
});

describe("pagination worker stats and solve wiring", () => {
  interface DonePost {
    type: string;
    stats?: { totalLines: number; openerPages: number; blankPages: number };
  }

  function fakeResult() {
    const line = { text: "x", x: 0, y: 0, width: 1, hyphenated: false };
    return {
      pageCount: 2,
      pages: [
        { index: 0, side: "recto", kind: "opener", chapterIndex: 0, lines: [line, line] },
        { index: 1, side: "verso", kind: "body", chapterIndex: 0, lines: [line, line, line] },
      ],
    };
  }

  it("attaches tallied stats to every paginate done", async () => {
    const p = paginate('"Curated", serif');
    await flush();
    mocks.ensureCalls[0].resolve();
    await p;

    // The worker's transport (captured by the driveEngine mock) computes the
    // stats when the pass posts done.
    const transport = mocks.driveEngine.mock.calls[0][1] as unknown as {
      postDone: (result: unknown, wordCount: number) => void;
    };
    transport.postDone(fakeResult(), 42);

    const done = posts.find((m) => (m as DonePost).type === "done") as DonePost;
    expect(done.stats).toEqual({ totalLines: 5, openerPages: 1, blankPages: 0 });
  });

  it("runs the solve after the base design's font is loaded", async () => {
    const p = dispatch({
      type: "solve",
      requestId: nextId++,
      targetSheets: 12,
      base: { font: { family: '"Curated", serif' } },
      bounds: {},
    });
    await flush();
    expect(mocks.ensureFontLoaded).toHaveBeenCalledTimes(1);
    expect(mocks.runSolve).not.toHaveBeenCalled();

    mocks.ensureCalls[0].resolve();
    await p;
    expect(mocks.runSolve).toHaveBeenCalledTimes(1);
    const [, request] = mocks.runSolve.mock.calls[0] as unknown[];
    expect(request).toMatchObject({ targetSheets: 12 });
  });

  it("drops a solve superseded during its font load (latest-wins)", async () => {
    const first = dispatch({
      type: "solve",
      requestId: nextId++,
      targetSheets: 10,
      base: { font: { family: '"A", serif' } },
      bounds: {},
    });
    await flush();
    const second = paginate('"B", serif');
    await flush();

    mocks.ensureCalls.forEach((c) => c.resolve());
    await Promise.all([first, second]);
    expect(mocks.runSolve).not.toHaveBeenCalled();
    expect(mocks.driveEngine).toHaveBeenCalledTimes(1);
  });
});
