import { describe, it, expect, vi, afterEach } from "vitest";
import { loadSample } from "./loadSample";
import { parseEpub } from "../epub/parseEpub";
import { sourceId } from "../project/sourceId";
import { makeStandardEbooks } from "../test/epubFixtures";

afterEach(() => vi.unstubAllGlobals());

describe("loadSample source identity", () => {
  it("attaches a content hash to the parsed sample document", async () => {
    const bytes = makeStandardEbooks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.slice().buffer })),
    );

    const { document } = await loadSample();
    expect(document.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(document.source.sha256).toBe(await sourceId(bytes));
  });
});

// The file-import path in App composes the same two calls (parse, then hash the
// bytes it already holds); this proves that composition sets source.sha256.
describe("file import source identity", () => {
  it("sets source.sha256 on the parsed document from the imported bytes", async () => {
    const bytes = makeStandardEbooks();
    const { document } = parseEpub(bytes, "reader.epub");
    document.source.sha256 = await sourceId(bytes);
    expect(document.source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
