import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { Page, PageKind, PaginationResult } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { pagePointBox } from "./geometry";
import { imposeBook, DEFAULT_IMPOSITION } from "./impose";
import { buildTypeset, buildSignatures } from "./pdf";
import type { DocMeta } from "./protocol";

const here = dirname(fileURLToPath(import.meta.url));
const TTF = join(here, "..", "..", "public", "fonts", "embed", "lora-400.ttf");
const fontBytes = new Uint8Array(readFileSync(TTF));

const docMeta: DocMeta = { title: "Windermere", author: "A. Author", chapterTitles: { 0: "One" } };

function page(index: number, lines: string[], kind: PageKind = "body"): Page {
  return {
    index,
    side: index % 2 === 0 ? "recto" : "verso",
    kind,
    chapterIndex: 0,
    lines: lines.map((text, i) => ({ text, x: 0, y: i * 18, width: 120, hyphenated: false })),
  };
}

function result(count: number): PaginationResult {
  const pages = Array.from({ length: count }, (_, i) => page(i, [`Line on page ${i + 1}`]));
  return { pageCount: count, pages };
}

describe("buildTypeset", () => {
  it("emits exactly one PDF page per Page in the settled result", async () => {
    const r = result(7);
    const doc = await buildTypeset(r, DEFAULT_DESIGN, docMeta, fontBytes);
    const reloaded = await PDFDocument.load(await doc.save());
    expect(reloaded.getPageCount()).toBe(r.pageCount);
  });

  it("sizes each page at the trim in points", async () => {
    const doc = await buildTypeset(result(2), DEFAULT_DESIGN, docMeta, fontBytes);
    const reloaded = await PDFDocument.load(await doc.save());
    const box = pagePointBox(DEFAULT_DESIGN, "recto");
    for (const p of reloaded.getPages()) {
      expect(p.getWidth()).toBeCloseTo(box.pageWidthPt, 3);
      expect(p.getHeight()).toBeCloseTo(box.pageHeightPt, 3);
    }
  });

  it("embeds the face as a subset (a FontFile stream far smaller than the full face)", async () => {
    const doc = await buildTypeset(result(3), DEFAULT_DESIGN, docMeta, fontBytes);
    const bytes = await doc.save();
    const raw = Buffer.from(await doc.save({ useObjectStreams: false })).toString("latin1");
    // A font descriptor with an embedded TrueType font program.
    expect(raw).toMatch(/FontFile2/);
    expect(raw).toMatch(/\/Subtype\s*\/Type0/);
    // Only the used glyphs ship: the whole PDF is smaller than the source TTF.
    expect(bytes.length).toBeLessThan(fontBytes.length);
  });

  it("does not throw on a blank-only or single-page result", async () => {
    const blankOnly: PaginationResult = { pageCount: 1, pages: [page(0, [], "blank")] };
    const single: PaginationResult = { pageCount: 1, pages: [page(0, ["only"], "opener")] };
    for (const r of [blankOnly, single]) {
      const doc = await buildTypeset(r, DEFAULT_DESIGN, docMeta, fontBytes);
      const reloaded = await PDFDocument.load(await doc.save());
      expect(reloaded.getPageCount()).toBe(1);
    }
  });

  it("streams progress that ends at the page total", async () => {
    const seen: [number, number][] = [];
    await buildTypeset(result(3), DEFAULT_DESIGN, docMeta, fontBytes, (done, total) =>
      seen.push([done, total]),
    );
    expect(seen.at(-1)).toEqual([3, 3]);
  });
});

describe("buildSignatures", () => {
  it("emits one page per printed sheet side at the folded-sheet size", async () => {
    const r = result(8);
    const typeset = await buildTypeset(r, DEFAULT_DESIGN, docMeta, fontBytes);
    const plan = imposeBook(r.pageCount, DEFAULT_IMPOSITION);
    const sigDoc = await buildSignatures(typeset, plan, DEFAULT_DESIGN);
    const reloaded = await PDFDocument.load(await sigDoc.save());
    expect(reloaded.getPageCount()).toBe(plan.sides.length);

    const trim = pagePointBox(DEFAULT_DESIGN, "recto");
    for (const p of reloaded.getPages()) {
      expect(p.getWidth()).toBeCloseTo(trim.pageWidthPt * 2, 3);
      expect(p.getHeight()).toBeCloseTo(trim.pageHeightPt, 3);
    }
  });

  it("pads the last signature with blank cells for a non-multiple page count", async () => {
    const r = result(5); // pads to 8 -> one 8-page signature, 4 sides
    const typeset = await buildTypeset(r, DEFAULT_DESIGN, docMeta, fontBytes);
    const plan = imposeBook(r.pageCount, DEFAULT_IMPOSITION);
    const sigDoc = await buildSignatures(typeset, plan, DEFAULT_DESIGN);
    const reloaded = await PDFDocument.load(await sigDoc.save());
    expect(reloaded.getPageCount()).toBe(plan.sides.length); // no error, full sheets
    expect(plan.paddedPageCount).toBe(8);
  });

  it("embeds blank pages (no drawn content) into the signature file", async () => {
    // A real book has blank leaves (chapters opening recto). Each must still
    // carry a content stream, or embedPages rejects it with "missing Contents".
    const pages: Page[] = [
      page(0, ["First page"], "opener"),
      page(1, [], "blank"),
      page(2, ["Body text"], "body"),
      page(3, [], "blank"),
    ];
    const r: PaginationResult = { pageCount: pages.length, pages };
    const typeset = await buildTypeset(r, DEFAULT_DESIGN, docMeta, fontBytes);
    const plan = imposeBook(r.pageCount, DEFAULT_IMPOSITION);
    const sigDoc = await buildSignatures(typeset, plan, DEFAULT_DESIGN);
    const reloaded = await PDFDocument.load(await sigDoc.save());
    expect(reloaded.getPageCount()).toBe(plan.sides.length);
  });

  it("builds from a single-page (padded) result without throwing", async () => {
    const r = result(1);
    const typeset = await buildTypeset(r, DEFAULT_DESIGN, docMeta, fontBytes);
    const plan = imposeBook(r.pageCount, { sheetsPerSignature: 4, flip: "short-edge" });
    const sigDoc = await buildSignatures(typeset, plan, DEFAULT_DESIGN);
    const reloaded = await PDFDocument.load(await sigDoc.save());
    expect(reloaded.getPageCount()).toBe(2); // one sheet, front + back
  });
});
