import { unzipSync } from "fflate";
import { ParseError } from "./errors";

export type FileMap = Map<string, Uint8Array>;

/**
 * Inflate EPUB bytes into a path -> bytes map, entirely in memory.
 * A payload that is not a valid ZIP throws ParseError('not-a-zip').
 * The returned map is the only thing kept; callers must not retain the
 * input bytes once the Document is built.
 */
export function unzip(bytes: Uint8Array): FileMap {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ParseError("not-a-zip");
  }

  const map: FileMap = new Map();
  for (const path of Object.keys(files)) {
    // Normalize away any leading "./" and backslashes for stable lookups.
    const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
    map.set(normalized, files[path]);
  }

  if (map.size === 0) throw new ParseError("not-a-zip");
  return map;
}

const decoder = new TextDecoder("utf-8");

/** Decode a file's bytes as UTF-8 text, or undefined if the file is absent. */
export function readText(files: FileMap, path: string): string | undefined {
  const bytes = files.get(path);
  if (!bytes) return undefined;
  return decoder.decode(bytes);
}
