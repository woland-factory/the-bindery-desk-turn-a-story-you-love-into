import { FONT_CATALOG, type FontEntry } from "./catalog";

// Main-thread font loading for on-screen rendering. Builds a FontFace per weight
// from the entry's URLs, adds it to document.fonts, and resolves. Idempotent
// (cached by id) and a no-op for the system serif and where FontFace is absent
// (jsdom). These are same-origin app assets, not an upload path.

const loaded = new Map<string, Promise<void>>();

export function loadFontFace(entry: FontEntry): Promise<void> {
  if (!entry.embeddable || !entry.weights) return Promise.resolve();
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) {
    return Promise.resolve();
  }
  const cached = loaded.get(entry.id);
  if (cached) return cached;

  const weights = entry.weights;
  const promise = (async () => {
    const faces = [
      new FontFace(entry.family, `url(${weights.regular})`, { weight: "400", style: "normal" }),
      new FontFace(entry.family, `url(${weights.bold})`, { weight: "700", style: "normal" }),
    ];
    await Promise.all(
      faces.map(async (face) => {
        await face.load();
        document.fonts.add(face);
      }),
    );
  })();

  loaded.set(entry.id, promise);
  // A failed load should not poison the cache; let a later attempt retry.
  promise.catch(() => loaded.delete(entry.id));
  return promise;
}

/**
 * Load every embeddable face off the critical path. Swallows a per-face failure
 * (a missing file degrades to the fallback stack) so it never throws.
 */
export async function warmCatalog(): Promise<void> {
  await Promise.all(
    FONT_CATALOG.filter((e) => e.embeddable).map((e) => loadFontFace(e).catch(() => {})),
  );
}
