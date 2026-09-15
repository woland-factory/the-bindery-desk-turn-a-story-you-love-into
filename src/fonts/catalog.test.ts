import { describe, it, expect } from "vitest";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { entryForId, entryForStack, FONT_CATALOG, SYSTEM_SERIF } from "./catalog";

describe("FONT_CATALOG", () => {
  it("leads with the system serif and carries at least three embeddable faces", () => {
    expect(FONT_CATALOG[0]).toBe(SYSTEM_SERIF);
    expect(SYSTEM_SERIF.embeddable).toBe(false);
    expect(SYSTEM_SERIF.weights).toBeUndefined();
    expect(FONT_CATALOG.filter((e) => e.embeddable).length).toBeGreaterThanOrEqual(3);
  });

  it("gives every embeddable face two weights and an OFL license", () => {
    for (const e of FONT_CATALOG.filter((f) => f.embeddable)) {
      expect(e.weights?.regular).toMatch(/\.woff2$/);
      expect(e.weights?.bold).toMatch(/\.woff2$/);
      expect(e.license).toBe("OFL-1.1");
    }
  });

  it("matches the shipped default stack to the system serif entry", () => {
    expect(entryForStack(DEFAULT_DESIGN.font.family)).toBe(SYSTEM_SERIF);
  });
});

describe("entryForStack / entryForId round-trip", () => {
  it("maps every catalog stack back to its entry", () => {
    for (const e of FONT_CATALOG) {
      expect(entryForStack(e.stack)).toBe(e);
      expect(entryForId(e.id)).toBe(e);
    }
  });

  it("returns null for an unknown stack or id", () => {
    expect(entryForStack("Comic Sans")).toBeNull();
    expect(entryForId("nope")).toBeNull();
  });
});
