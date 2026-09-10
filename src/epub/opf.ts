import type { FileMap } from "./unzip";
import { readText } from "./unzip";
import { ParseError } from "./errors";
import { parseXml, byLocalName, firstByLocalName, normalizeWhitespace } from "./xml";
import { dirname, resolveHref } from "./paths";

export interface ManifestItem {
  id: string;
  /** Resolved zip path (relative to the OPF directory). */
  href: string;
  mediaType: string;
  /** OPF3 `properties` tokens, e.g. "nav", "cover-image". */
  properties: string[];
}

export interface SpineEntry {
  idref: string;
  linear: boolean;
  item: ManifestItem;
}

export interface OpfData {
  metadata: { title: string; author: string; language: string };
  manifest: Map<string, ManifestItem>;
  /** Reading order: linear items first, then non-linear, nav doc removed. */
  spine: SpineEntry[];
  /** Resolved zip path of the EPUB3 nav document, if any. */
  navPath?: string;
  /** Resolved zip path of the EPUB2 NCX, if any. */
  ncxPath?: string;
  /** Directory the OPF lives in; hrefs resolve against it. */
  opfDir: string;
}

/** Parse the OPF package: metadata, manifest, and ordered spine. */
export function parseOpf(files: FileMap, opfPath: string): OpfData {
  const text = readText(files, opfPath);
  if (!text) throw new ParseError("no-opf");
  const doc = parseXml(text);
  if (!doc) throw new ParseError("no-opf");

  const opfDir = dirname(opfPath);

  // --- Metadata ---
  const title = firstTagText(doc, "title") || "Untitled";
  const creators = byLocalName(doc, "creator")
    .map((el) => normalizeWhitespace(el.textContent ?? ""))
    .filter(Boolean);
  const author = creators.join(", ");
  const language = firstTagText(doc, "language");

  // --- Manifest ---
  const manifest = new Map<string, ManifestItem>();
  let navPath: string | undefined;
  const manifestEl = firstByLocalName(doc, "manifest");
  if (manifestEl) {
    for (const el of byLocalName(manifestEl, "item")) {
      const id = el.getAttribute("id");
      const href = el.getAttribute("href");
      if (!id || !href) continue;
      const properties = (el.getAttribute("properties") ?? "").split(/\s+/).filter(Boolean);
      const item: ManifestItem = {
        id,
        href: resolveHref(opfDir, href),
        mediaType: el.getAttribute("media-type") ?? "",
        properties,
      };
      manifest.set(id, item);
      if (properties.includes("nav")) navPath = item.href;
    }
  }

  // --- Spine ---
  const spineEl = firstByLocalName(doc, "spine");
  if (!spineEl) throw new ParseError("empty-spine");

  // EPUB2 points at the NCX via spine@toc (a manifest id).
  const ncxId = spineEl.getAttribute("toc");
  const ncxPath = ncxId ? manifest.get(ncxId)?.href : undefined;

  const linear: SpineEntry[] = [];
  const nonLinear: SpineEntry[] = [];
  for (const el of byLocalName(spineEl, "itemref")) {
    const idref = el.getAttribute("idref");
    if (!idref) continue;
    const item = manifest.get(idref);
    if (!item) continue;
    // The nav document is structure, never a reading-order chapter.
    if (item.href === navPath) continue;
    const entry: SpineEntry = { idref, linear: el.getAttribute("linear") !== "no", item };
    if (entry.linear) linear.push(entry);
    else nonLinear.push(entry);
  }
  const spine = [...linear, ...nonLinear];
  if (spine.length === 0) throw new ParseError("empty-spine");

  return { metadata: { title, author, language }, manifest, spine, navPath, ncxPath, opfDir };
}

function firstTagText(root: ParentNode, localName: string): string {
  const el = firstByLocalName(root, localName);
  return el ? normalizeWhitespace(el.textContent ?? "") : "";
}
