import { describe, it, expect } from "vitest";
import { parseEpub } from "./parseEpub";
import { ParseError } from "./errors";
import { keptBlockCount } from "../model/document";
import {
  makeAo3,
  makeStandardEbooks,
  makeNoToc,
  makeBadChapter,
  makeMissingOpf,
  makeEmptySpine,
  makeNotAZip,
} from "../test/epubFixtures";

describe("parseEpub: metadata and ordered chapters", () => {
  it("parses AO3-style (NCX) into ordered, correctly-titled chapters", () => {
    const { document } = parseEpub(makeAo3(), "ao3.epub");
    expect(document.title).toBe("A Tale of Testing");
    expect(document.author).toBe("Ada Archivist");
    expect(document.language).toBe("en");
    expect(document.chapters.map((c) => c.order)).toEqual([0, 1, 2, 3, 4]);
    expect(document.chapters.map((c) => c.title)).toEqual([
      "Title Page",
      "Preface",
      "The Beginning",
      "The Middle",
      "The End",
    ]);
    expect(document.source).toEqual({ name: "ao3.epub", byteLength: expect.any(Number) });
  });

  it("parses Standard-Ebooks-style (nav) with joined authors and ordered titles", () => {
    const { document } = parseEpub(makeStandardEbooks(), "se.epub");
    expect(document.title).toBe("The Public Domain Reader");
    expect(document.author).toBe("Jane Author, John Coauthor");
    expect(document.language).toBe("en-US");
    expect(document.chapters.map((c) => c.title)).toEqual([
      "The First Part",
      "The Second Part",
      "The Third Part",
      "Colophon",
    ]);
  });

  it("falls back to first-heading then Chapter N when no TOC exists", () => {
    const { document } = parseEpub(makeNoToc(), "no-toc.epub");
    expect(document.chapters.map((c) => c.title)).toEqual(["Alpha", "Chapter 2"]);
  });
});

describe("parseEpub: image and author-note policy + report", () => {
  it("keeps text and notes, drops images and boilerplate with counts (AO3)", () => {
    const { document, report } = parseEpub(makeAo3(), "ao3.epub");

    // Chapter 1 carries a heading, two paragraphs, a kept note, a dropped image.
    const ch1 = document.chapters[2];
    expect(ch1.blocks.map((b) => [b.type, b.keptOrDropped])).toEqual([
      ["heading", "kept"],
      ["paragraph", "kept"],
      ["paragraph", "kept"],
      ["note", "kept"],
      ["image", "dropped"],
    ]);
    const image = ch1.blocks.find((b) => b.type === "image")!;
    expect(image.src).toBe("OEBPS/images/pic.png");
    expect(image.alt).toBe("a hand-drawn map");

    expect(report.keptCounts).toEqual({ headings: 3, paragraphs: 6, notes: 1 });
    expect(report.droppedCounts).toEqual({ images: 1, notes: 0, boilerplate: 2 });

    const kinds = report.records.map((r) => r.kind).sort();
    expect(kinds).toEqual(["boilerplate", "boilerplate", "image"]);
  });

  it("drops a colophon as boilerplate and keeps story text (Standard Ebooks)", () => {
    const { report } = parseEpub(makeStandardEbooks(), "se.epub");
    expect(report.keptCounts).toEqual({ headings: 3, paragraphs: 6, notes: 0 });
    expect(report.droppedCounts).toEqual({ images: 0, notes: 0, boilerplate: 1 });
  });

  it("never puts body text in a drop record's reason or detail", () => {
    const { report } = parseEpub(makeAo3(), "ao3.epub");
    for (const r of report.records) {
      expect(r.reason.length).toBeLessThan(60);
      if (r.detail) expect(r.detail).not.toMatch(/paragraph of the story/);
      expect(r.reason).not.toMatch(/paragraph of the story/);
    }
  });
});

describe("parseEpub: contained faults and typed errors", () => {
  it("contains a single unreadable chapter without aborting the parse", () => {
    const { document, report } = parseEpub(makeBadChapter(), "bad.epub");
    expect(document.chapters).toHaveLength(2);
    const ghost = document.chapters[1];
    expect(keptBlockCount(ghost)).toBe(0);
    expect(ghost.blocks.every((b) => b.keptOrDropped === "dropped")).toBe(true);
    expect(report.droppedCounts.boilerplate).toBeGreaterThanOrEqual(1);
  });

  it("throws typed ParseErrors for whole-archive failures", () => {
    expect(() => parseEpub(makeNotAZip(), "x.epub")).toThrowError(ParseError);
    expect(() => parseEpub(makeNotAZip(), "x.epub")).toThrow(
      expect.objectContaining({ code: "not-a-zip" }),
    );
    expect(() => parseEpub(makeMissingOpf(), "x.epub")).toThrow(
      expect.objectContaining({ code: "no-opf" }),
    );
    expect(() => parseEpub(makeEmptySpine(), "x.epub")).toThrow(
      expect.objectContaining({ code: "empty-spine" }),
    );
  });

  it("rejects an over-cap file before unzipping", () => {
    const big = new Uint8Array(100);
    expect(() => parseEpub(big, "big.epub", 50)).toThrow(
      expect.objectContaining({ code: "too-large" }),
    );
  });
});
