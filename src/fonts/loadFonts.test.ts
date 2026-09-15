import { describe, it, expect, vi, afterEach } from "vitest";
import { SYSTEM_SERIF, type FontEntry } from "./catalog";
import { loadFontFace, warmCatalog } from "./loadFonts";

const curated: FontEntry = {
  id: "test-face",
  label: "Test Face",
  family: "Test Face",
  stack: '"Test Face", serif',
  embeddable: true,
  weights: { regular: "/fonts/test-400.woff2", bold: "/fonts/test-700.woff2" },
};

function stubFontFace(loadImpl: () => Promise<unknown> = () => Promise.resolve()) {
  const added: unknown[] = [];
  const ctor = vi.fn(function (this: Record<string, unknown>, family: string) {
    this.family = family;
    this.load = loadImpl;
  });
  vi.stubGlobal("FontFace", ctor as unknown);
  vi.stubGlobal("document", { fonts: { add: (f: unknown) => added.push(f) } });
  return { ctor, added };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadFontFace", () => {
  it("is a no-op for the system serif", async () => {
    const { ctor } = stubFontFace();
    await loadFontFace(SYSTEM_SERIF);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("is a no-op where FontFace is absent (jsdom)", async () => {
    // No stub: FontFace is undefined here.
    await expect(loadFontFace(curated)).resolves.toBeUndefined();
  });

  it("loads both weights and adds them to document.fonts", async () => {
    const face: FontEntry = { ...curated, id: "load-both" };
    const { ctor, added } = stubFontFace();
    await loadFontFace(face);
    expect(ctor).toHaveBeenCalledTimes(2);
    expect(added.length).toBe(2);
  });

  it("caches by id: a second call does not rebuild the faces", async () => {
    const face: FontEntry = { ...curated, id: "cached" };
    const { ctor } = stubFontFace();
    await loadFontFace(face);
    await loadFontFace(face);
    expect(ctor).toHaveBeenCalledTimes(2); // not 4
  });
});

describe("warmCatalog", () => {
  it("swallows a per-face load failure without throwing", async () => {
    stubFontFace(() => Promise.reject(new Error("missing file")));
    await expect(warmCatalog()).resolves.toBeUndefined();
  });
});
