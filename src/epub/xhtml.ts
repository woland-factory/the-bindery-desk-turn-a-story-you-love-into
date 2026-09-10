// Chapter body -> typed text blocks, per the §4 drop policy.
//
// Keep all story-relevant text. Headings and paragraphs are kept as text;
// author/story notes are kept but typed `note` so a later dial can toggle
// them. Inline images are dropped from the flow but recorded (src + alt).
// Whole-document boilerplate (cover, toc, colophon, Gutenberg license
// pages, AO3 work-metadata pages) is dropped as a single recorded note.
//
// Everything dropped stays in the model with keptOrDropped: 'dropped' and a
// dropReason, so the import report is honest. dropReason/detail never carry
// full body text (privacy): only short labels like an image src.

import type { Block } from "../model/document";
import { normalizeWhitespace } from "./xml";
import { resolveHref } from "./paths";

// Elements that introduce their own block; a container holding any of these
// is recursed into rather than flattened to a single paragraph.
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "aside", "blockquote", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "figure", "header", "footer", "main",
  "table", "pre", "nav", "hgroup", "details",
]);

// Tags whose text we emit directly as one paragraph (no further recursion).
const TEXT_LEAF_TAGS = new Set(["p", "li", "blockquote", "pre"]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

// Tags that never contribute text to the reading flow.
const IGNORE_TAGS = new Set(["script", "style", "head", "title", "link", "meta"]);

/**
 * Decide whether a whole document is boilerplate (not a story chapter).
 * Conservative by design: when unsure, return null so the content is kept.
 * Returns a short human label when boilerplate, else null.
 */
export function boilerplateLabel(
  item: { href: string; properties: string[] },
  doc: globalThis.Document,
): string | null {
  const base = item.href.split("/").pop()?.toLowerCase() ?? "";

  // 1. Manifest/name role: cover, title page, toc, colophon, copyright.
  if (/(^|[-_])(cover|titlepage|title[-_]?page|colophon|copyright|imprint|toc|nav)([-_.]|$)/.test(base)) {
    return labelFromName(base);
  }

  // 2. epub:type on the body or a top-level section.
  const roleEl = doc.body?.querySelector("[*|type], body");
  const epubType =
    doc.body?.getAttribute("epub:type") ??
    doc.body?.querySelector("section")?.getAttribute("epub:type") ??
    roleEl?.getAttribute("epub:type") ??
    "";
  if (/\b(cover|titlepage|colophon|copyright-page|toc|imprint)\b/i.test(epubType)) {
    return epubType;
  }

  const bodyText = normalizeWhitespace(doc.body?.textContent ?? "");

  // 3. Project Gutenberg license pages (header/footer boilerplate docs).
  if (
    /PROJECT GUTENBERG/i.test(bodyText) &&
    /(START OF TH(E|IS) PROJECT GUTENBERG|END OF TH(E|IS) PROJECT GUTENBERG|small print|license|ebook is for the use of anyone)/i.test(
      bodyText,
    )
  ) {
    return "Project Gutenberg license";
  }

  // 4. AO3 work-metadata page: several of these labels appear together.
  const ao3Markers = [
    /\bArchive Warning/i, /\bRating:/i, /\bCategory:/i, /\bFandom:/i,
    /\bRelationship:/i, /\bSummary:/i, /\bPublished:/i, /\bUpdated:/i,
    /\bChapters:\s*\d+\/?/i, /\bStats:/i,
  ].filter((re) => re.test(bodyText)).length;
  if (ao3Markers >= 3) return "work metadata";

  return null;
}

function labelFromName(base: string): string {
  if (base.includes("cover")) return "cover page";
  if (base.includes("title")) return "title page";
  if (base.includes("toc") || base.includes("nav")) return "table of contents";
  if (base.includes("colophon")) return "colophon";
  if (base.includes("copyright") || base.includes("imprint")) return "copyright page";
  return "front matter";
}

/** Extract ordered blocks from a parsed chapter document. */
export function blocksFromChapter(doc: globalThis.Document, chapterDir: string): Block[] {
  const blocks: Block[] = [];
  if (!doc.body) return blocks;
  walk(doc.body, chapterDir, blocks);
  return blocks;
}

function walk(node: Element, chapterDir: string, out: Block[]): void {
  for (const el of Array.from(node.children)) {
    handle(el, chapterDir, out);
  }
}

function handle(el: Element, chapterDir: string, out: Block[]): void {
  const tag = el.localName.toLowerCase();

  if (IGNORE_TAGS.has(tag)) return;

  if (HEADING_TAGS.has(tag)) {
    const text = normalizeWhitespace(el.textContent ?? "");
    if (text) out.push({ type: "heading", keptOrDropped: "kept", level: Number(tag[1]), text });
    return;
  }

  if (tag === "img") {
    pushImage(el.getAttribute("src"), el.getAttribute("alt"), chapterDir, out);
    return;
  }

  if (tag === "svg") {
    const image = el.querySelector("image");
    const href =
      image?.getAttribute("href") ?? image?.getAttribute("xlink:href") ?? "embedded image";
    pushImage(href, image?.getAttribute("alt"), chapterDir, out);
    return;
  }

  if (tag === "figure") {
    const img = el.querySelector("img");
    const svgImage = el.querySelector("svg image");
    const src =
      img?.getAttribute("src") ??
      svgImage?.getAttribute("href") ??
      svgImage?.getAttribute("xlink:href") ??
      "figure";
    const alt = img?.getAttribute("alt") ?? el.querySelector("figcaption")?.textContent ?? null;
    pushImage(src, alt, chapterDir, out);
    return;
  }

  // Notes: kept, but typed so a later dial can toggle them.
  if (isNote(el)) {
    const text = normalizeWhitespace(el.textContent ?? "");
    if (text) out.push({ type: "note", keptOrDropped: "kept", text });
    return;
  }

  if (TEXT_LEAF_TAGS.has(tag)) {
    const text = normalizeWhitespace(el.textContent ?? "");
    if (text) out.push({ type: "paragraph", keptOrDropped: "kept", text });
    return;
  }

  // Containers: recurse when they hold block children, otherwise flatten
  // their inline content (div/span leaves) into one paragraph.
  if (hasBlockChild(el)) {
    walk(el, chapterDir, out);
    return;
  }
  const text = normalizeWhitespace(el.textContent ?? "");
  if (text) out.push({ type: "paragraph", keptOrDropped: "kept", text });
}

function pushImage(
  src: string | null,
  alt: string | null,
  chapterDir: string,
  out: Block[],
): void {
  const resolved = src ? resolveHref(chapterDir, src) : undefined;
  out.push({
    type: "image",
    keptOrDropped: "dropped",
    src: resolved,
    alt: alt ? normalizeWhitespace(alt) : undefined,
    dropReason: "image",
  });
}

function isNote(el: Element): boolean {
  if (el.localName.toLowerCase() === "aside") return true;
  const epubType = el.getAttribute("epub:type") ?? el.getAttribute("type") ?? "";
  if (/\b(footnote|endnote|rearnote|note)\b/i.test(epubType)) return true;
  const role = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
  if (/\b(notes?|footnote|endnote|rearnote)\b/i.test(role)) return true;
  return false;
}

function hasBlockChild(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (BLOCK_TAGS.has(child.localName.toLowerCase())) return true;
  }
  return false;
}
