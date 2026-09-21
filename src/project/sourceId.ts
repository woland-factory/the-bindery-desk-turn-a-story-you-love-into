// A content hash that lets a saved project ask "is this the same book I saved
// from?" without holding the book. Pure over its input bytes: no DOM, no
// network. Computed once per import, at the import boundary, off the hot
// re-flow path. A large digest costs well under the perceived-speed budget and
// never touches a paginate.

/**
 * The lowercase hex SHA-256 of the given bytes. Returns undefined when
 * `crypto.subtle` is unavailable, so an import never crashes; a project then
 * simply cannot assert a source match and is applied as "unknown".
 */
export async function sourceId(bytes: Uint8Array): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  // Cast to BufferSource: a Uint8Array may be backed by a SharedArrayBuffer,
  // which the DOM lib's ArrayBuffer-only view type rejects at build time.
  const digest = await subtle.digest("SHA-256", bytes as unknown as BufferSource);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const b of view) hex += b.toString(16).padStart(2, "0");
  return hex;
}
