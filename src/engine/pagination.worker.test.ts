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
