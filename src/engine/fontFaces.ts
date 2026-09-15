import type { FontEntry } from "../fonts/catalog";

// Worker-safe font loading for accurate measurement. OffscreenCanvas measures
// with a family only if it is present in the worker's FontFaceSet; measuring an
// unloaded curated family silently falls back to a default face and produces
// wrong line breaks. So the worker loads the design's face here before it
// measures. Pure of DOM (uses fetch + FontFace + self.fonts), so it unit-tests
// with stubs. Idempotent, cached by id, and a no-op for the system serif and
// where FontFace / self.fonts is absent (e.g. jsdom).

interface FontFaceSetLike {
  add(face: unknown): void;
}
interface FontFaceCtor {
  new (family: string, source: BufferSource, descriptors?: { weight?: string; style?: string }): {
    load(): Promise<unknown>;
  };
}

const loaded = new Map<string, Promise<void>>();

function fontEnv(): { FontFaceImpl: FontFaceCtor; fonts: FontFaceSetLike } | null {
  const g = globalThis as unknown as {
    FontFace?: FontFaceCtor;
    fonts?: FontFaceSetLike;
  };
  if (typeof g.FontFace !== "function") return null;
  if (!g.fonts || typeof g.fonts.add !== "function") return null;
  return { FontFaceImpl: g.FontFace, fonts: g.fonts };
}

export function ensureFontLoaded(entry: FontEntry | null | undefined): Promise<void> {
  if (!entry || !entry.embeddable || !entry.weights) return Promise.resolve();
  const env = fontEnv();
  if (!env) return Promise.resolve();
  const cached = loaded.get(entry.id);
  if (cached) return cached;

  const weights = entry.weights;
  const promise = (async () => {
    const specs: [string, string][] = [
      [weights.regular, "400"],
      [weights.bold, "700"],
    ];
    await Promise.all(
      specs.map(async ([url, weight]) => {
        const response = await fetch(url);
        const bytes = await response.arrayBuffer();
        const face = new env.FontFaceImpl(entry.family, bytes, { weight, style: "normal" });
        await face.load();
        env.fonts.add(face);
      }),
    );
  })();

  loaded.set(entry.id, promise);
  promise.catch(() => loaded.delete(entry.id));
  return promise;
}
