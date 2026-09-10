import type { FileMap } from "./unzip";
import { readText } from "./unzip";
import { ParseError } from "./errors";
import { parseXml, byLocalName } from "./xml";

/**
 * Resolve the OPF package path from META-INF/container.xml.
 * A missing or invalid container, or no rootfile full-path, throws
 * ParseError('no-opf').
 */
export function findOpfPath(files: FileMap): string {
  const text = readText(files, "META-INF/container.xml");
  if (!text) throw new ParseError("no-opf");

  const doc = parseXml(text);
  if (!doc) throw new ParseError("no-opf");

  const rootfile = byLocalName(doc, "rootfile")[0];
  const fullPath = rootfile?.getAttribute("full-path");
  if (!fullPath) throw new ParseError("no-opf");

  const normalized = fullPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!files.has(normalized)) throw new ParseError("no-opf");
  return normalized;
}
