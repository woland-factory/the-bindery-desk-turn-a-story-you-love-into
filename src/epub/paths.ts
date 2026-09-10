// EPUB hrefs are relative to the document that names them. These helpers
// resolve them into the flat zip paths used as map keys.

/** Directory portion of a zip path, "" for a top-level file. */
export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Resolve `href` relative to `baseDir` into a normalized zip path.
 * Strips any URL fragment (`#anchor`) and collapses `.`/`..` segments.
 */
export function resolveHref(baseDir: string, href: string): string {
  const noFragment = href.split("#")[0];
  const decoded = safeDecode(noFragment);
  const combined = baseDir ? `${baseDir}/${decoded}` : decoded;

  const parts: string[] = [];
  for (const seg of combined.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** The fragment (without `#`) of an href, or "" if none. */
export function fragmentOf(href: string): string {
  const i = href.indexOf("#");
  return i === -1 ? "" : href.slice(i + 1);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
