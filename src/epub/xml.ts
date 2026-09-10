// Thin wrappers over the platform DOMParser. OPF/NCX are parsed as XML;
// chapter bodies as XHTML with an HTML fallback for loose markup.

/** Parse OPF/NCX/nav XML. Returns null if the document is not well-formed. */
export function parseXml(text: string): XMLDocument | null {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  return doc;
}

/**
 * Parse a chapter body. Try strict XHTML first; if that is not well-formed
 * (common in the wild), fall back to the forgiving text/html parser.
 * Returns null only if both fail to yield a body.
 */
export function parseChapterDoc(text: string): globalThis.Document | null {
  const xhtml = new DOMParser().parseFromString(text, "application/xhtml+xml");
  if (xhtml.getElementsByTagName("parsererror").length === 0 && xhtml.body) {
    return xhtml;
  }
  const html = new DOMParser().parseFromString(text, "text/html");
  return html.body ? html : null;
}

/**
 * Namespace-agnostic lookup of direct and nested elements by local name.
 * OPF and NCX use namespaces inconsistently across exporters, so we match
 * on local name rather than a fixed namespace URI.
 */
export function byLocalName(root: ParentNode, localName: string): Element[] {
  const out: Element[] = [];
  const lower = localName.toLowerCase();
  const walk = (node: ParentNode) => {
    for (const el of Array.from(node.children)) {
      if (el.localName.toLowerCase() === lower) out.push(el);
      walk(el);
    }
  };
  walk(root);
  return out;
}

/** First descendant with the given local name, or null. */
export function firstByLocalName(root: ParentNode, localName: string): Element | null {
  return byLocalName(root, localName)[0] ?? null;
}

/** Collapse runs of whitespace to single spaces and trim. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
