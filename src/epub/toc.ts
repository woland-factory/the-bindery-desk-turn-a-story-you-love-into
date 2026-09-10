import type { FileMap } from "./unzip";
import { readText } from "./unzip";
import type { OpfData } from "./opf";
import { parseXml, byLocalName, normalizeWhitespace } from "./xml";
import { dirname, resolveHref, fragmentOf } from "./paths";

export interface TocEntry {
  title: string;
  /** Resolved zip path of the target document (fragment stripped). */
  path: string;
  /** The target fragment, "" if none. */
  fragment: string;
}

/**
 * Build an ordered list of TOC entries. Prefers the EPUB3 nav document;
 * falls back to the EPUB2 NCX. An absent or unparseable TOC returns an
 * empty list (titles then fall back to headings / "Chapter N").
 */
export function parseToc(files: FileMap, opf: OpfData): TocEntry[] {
  if (opf.navPath) {
    const fromNav = parseNav(files, opf.navPath);
    if (fromNav.length > 0) return fromNav;
  }
  if (opf.ncxPath) {
    const fromNcx = parseNcx(files, opf.ncxPath);
    if (fromNcx.length > 0) return fromNcx;
  }
  return [];
}

function parseNav(files: FileMap, navPath: string): TocEntry[] {
  const text = readText(files, navPath);
  if (!text) return [];
  const doc = parseXml(text);
  if (!doc) return [];

  // Prefer the nav whose epub:type is "toc"; else the first nav element.
  const navs = byLocalName(doc, "nav");
  const tocNav =
    navs.find((n) => (n.getAttribute("epub:type") ?? n.getAttribute("type")) === "toc") ?? navs[0];
  if (!tocNav) return [];

  const ol = byLocalName(tocNav, "ol")[0];
  if (!ol) return [];

  const baseDir = dirname(navPath);
  const entries: TocEntry[] = [];
  for (const a of byLocalName(ol, "a")) {
    const href = a.getAttribute("href");
    const title = normalizeWhitespace(a.textContent ?? "");
    if (!href || !title) continue;
    entries.push({ title, path: resolveHref(baseDir, href), fragment: fragmentOf(href) });
  }
  return entries;
}

function parseNcx(files: FileMap, ncxPath: string): TocEntry[] {
  const text = readText(files, ncxPath);
  if (!text) return [];
  const doc = parseXml(text);
  if (!doc) return [];

  const navMap = byLocalName(doc, "navMap")[0];
  if (!navMap) return [];

  const baseDir = dirname(ncxPath);
  const points = byLocalName(navMap, "navPoint");

  // Respect playOrder when present; otherwise keep document order (stable).
  const ordered = points
    .map((el, index) => ({ el, index, playOrder: Number(el.getAttribute("playOrder") ?? "NaN") }))
    .sort((a, b) => {
      const ap = Number.isNaN(a.playOrder) ? a.index : a.playOrder;
      const bp = Number.isNaN(b.playOrder) ? b.index : b.playOrder;
      return ap - bp || a.index - b.index;
    });

  const entries: TocEntry[] = [];
  for (const { el } of ordered) {
    const label = byLocalName(el, "text")[0];
    const content = byLocalName(el, "content")[0];
    const src = content?.getAttribute("src");
    const title = normalizeWhitespace(label?.textContent ?? "");
    if (!src || !title) continue;
    entries.push({ title, path: resolveHref(baseDir, src), fragment: fragmentOf(src) });
  }
  return entries;
}
