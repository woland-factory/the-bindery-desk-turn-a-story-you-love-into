import type { FileMap } from "./unzip";
import { readText } from "./unzip";
import type { OpfData } from "./opf";
import type { TocEntry } from "./toc";
import type { Block, Chapter } from "../model/document";
import { parseChapterDoc } from "./xml";
import { blocksFromChapter, boilerplateLabel } from "./xhtml";
import { dirname } from "./paths";

/**
 * Merge spine order with TOC titles into ordered chapters. One chapter per
 * spine document. Reading order is always spine order; the TOC supplies
 * titles only. A chapter that cannot be read never aborts the parse: it
 * yields empty story blocks plus a recorded boilerplate drop.
 */
export function buildChapters(files: FileMap, opf: OpfData, toc: TocEntry[]): Chapter[] {
  // First TOC entry pointing at each document wins as its title.
  const titleByPath = new Map<string, string>();
  for (const entry of toc) {
    if (!titleByPath.has(entry.path)) titleByPath.set(entry.path, entry.title);
  }

  const chapters: Chapter[] = [];
  opf.spine.forEach((entry, index) => {
    const item = entry.item;
    const blocks = readChapterBlocks(files, item);
    const title = titleByPath.get(item.href) ?? firstHeading(blocks) ?? `Chapter ${index + 1}`;
    chapters.push({ id: entry.idref || item.href, title, order: index, blocks });
  });

  return chapters;
}

function readChapterBlocks(files: FileMap, item: OpfData["spine"][number]["item"]): Block[] {
  const text = readText(files, item.href);
  if (text === undefined) return [boilerplateBlock("missing file")];

  const doc = parseChapterDoc(text);
  if (!doc) return [boilerplateBlock("could not read chapter")];

  const label = boilerplateLabel(item, doc);
  if (label) return [boilerplateBlock(label)];

  return blocksFromChapter(doc, dirname(item.href));
}

function boilerplateBlock(reason: string): Block {
  return { type: "note", keptOrDropped: "dropped", dropReason: reason };
}

function firstHeading(blocks: Block[]): string | undefined {
  for (const b of blocks) {
    if (b.type === "heading" && b.keptOrDropped === "kept" && b.text) return b.text;
  }
  return undefined;
}
