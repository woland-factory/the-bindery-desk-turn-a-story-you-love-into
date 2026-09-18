import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DesignSpec } from "../engine/types";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { FONT_CATALOG } from "../fonts/catalog";
import { resolveExportFont, FALLBACK_SERIF_ID } from "./fonts";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "..", "public");

function withFont(family: string): DesignSpec {
  return { ...DEFAULT_DESIGN, font: { ...DEFAULT_DESIGN.font, family } };
}

describe("resolveExportFont", () => {
  it("returns each OFL face's own embed URL", () => {
    for (const entry of FONT_CATALOG.filter((e) => e.embed)) {
      const resolved = resolveExportFont(withFont(entry.stack));
      expect(resolved.faceId).toBe(entry.id);
      expect(resolved.regularUrl).toBe(entry.embed!.regular);
      expect(resolved.substituted).toBe(false);
    }
  });

  it("substitutes the fallback serif for the system serif", () => {
    const resolved = resolveExportFont(DEFAULT_DESIGN); // default is the system serif
    expect(resolved.faceId).toBe(FALLBACK_SERIF_ID);
    expect(resolved.substituted).toBe(true);
    const fallback = FONT_CATALOG.find((e) => e.id === FALLBACK_SERIF_ID)!;
    expect(resolved.regularUrl).toBe(fallback.embed!.regular);
  });
});

describe("embed assets", () => {
  it("ships a non-empty TTF for every embeddable face and weight", () => {
    for (const entry of FONT_CATALOG.filter((e) => e.embed)) {
      for (const url of [entry.embed!.regular, entry.embed!.bold]) {
        const bytes = readFileSync(join(publicDir, url.replace(/^\//, "")));
        expect(bytes.length).toBeGreaterThan(1000);
        // TrueType outlines begin with the 0x00010000 sfnt version tag.
        expect(bytes[0]).toBe(0x00);
        expect(bytes[1]).toBe(0x01);
      }
    }
  });
});
