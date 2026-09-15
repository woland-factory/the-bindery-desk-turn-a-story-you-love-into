import { describe, it, expect, vi, afterEach } from "vitest";
import { SYSTEM_SERIF, type FontEntry } from "../fonts/catalog";
import { ensureFontLoaded } from "./fontFaces";

const curated: FontEntry = {
  id: "worker-face",
  label: "Worker Face",
  family: "Worker Face",
  stack: '"Worker Face", serif',
  embeddable: true,
  weights: { regular: "/fonts/w-400.woff2", bold: "/fonts/w-700.woff2" },
};

function stubWorkerFontEnv() {
  const added: unknown[] = [];
  const fetchSpy = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
  const ctor = vi.fn(function (this: Record<string, unknown>) {
    this.load = () => Promise.resolve();
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("FontFace", ctor as unknown);
  vi.stubGlobal("fonts", { add: (f: unknown) => added.push(f) });
  return { fetchSpy, ctor, added };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureFontLoaded", () => {
  it("is a no-op for the system serif (no fetch)", async () => {
    const { fetchSpy } = stubWorkerFontEnv();
    await ensureFontLoaded(SYSTEM_SERIF);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is a no-op for a null entry", async () => {
    await expect(ensureFontLoaded(null)).resolves.toBeUndefined();
  });

  it("is a no-op where FontFace is absent", async () => {
    // No stub: FontFace/fonts undefined here, and fetch must not be reached.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await ensureFontLoaded({ ...curated, id: "absent" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches both weights and adds them before resolving", async () => {
    const { fetchSpy, added } = stubWorkerFontEnv();
    await ensureFontLoaded({ ...curated, id: "load" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(added.length).toBe(2);
  });

  it("caches by id: a second call refetches nothing", async () => {
    const { fetchSpy } = stubWorkerFontEnv();
    const face = { ...curated, id: "cache" };
    await ensureFontLoaded(face);
    await ensureFontLoaded(face);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // not 4
  });
});
