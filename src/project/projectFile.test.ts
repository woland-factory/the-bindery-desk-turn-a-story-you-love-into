import { describe, it, expect } from "vitest";
import {
  buildHouseStyle,
  buildProject,
  readSettingsFile,
  type SourceRef,
} from "./projectFile";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { DEFAULT_BOUNDS } from "../engine/budget";
import { DEFAULT_IMPOSITION } from "../export/impose";
import { sanitizeDesign } from "../ui/design/persistDesign";
import { sanitizeBounds } from "../ui/budget/persistBudget";
import { sanitizeImposition } from "../export/persistPrint";
import { applyFontSize } from "../ui/design/designPatch";

const source: SourceRef = { name: "novel.epub", sha256: "abc123", byteLength: 4096 };
const design = applyFontSize(DEFAULT_DESIGN, 12.5);
const bounds = { ...DEFAULT_BOUNDS, fontMaxPt: 15 };
const imposition = { sheetsPerSignature: 2, flip: "short-edge" as const };

describe("buildProject / readSettingsFile round-trip", () => {
  it("round-trips design, bounds, and imposition with the source ref", () => {
    const file = buildProject(source, design, bounds, imposition);
    const loaded = readSettingsFile(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.origin).toBe("project");
    expect(loaded.design).toEqual(sanitizeDesign(design));
    expect(loaded.bounds).toEqual(sanitizeBounds(bounds));
    expect(loaded.imposition).toEqual(sanitizeImposition(imposition));
    expect(loaded.source).toEqual(source);
  });

  it("round-trips a house style with no source", () => {
    const file = buildHouseStyle(design, bounds, imposition);
    const loaded = readSettingsFile(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.origin).toBe("housestyle");
    expect(loaded.source).toBeUndefined();
    expect(loaded.design).toEqual(sanitizeDesign(design));
  });

  it("drops sha256 from the source ref when it is absent", () => {
    const file = buildProject({ name: "x.epub", byteLength: 10 }, design, bounds, imposition);
    expect("sha256" in file.source).toBe(false);
    const loaded = readSettingsFile(JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.source).toEqual({ name: "x.epub", byteLength: 10 });
  });
});

describe("readSettingsFile errors and clamping", () => {
  it("rejects non-JSON text", () => {
    expect(readSettingsFile("not json {")).toEqual({ ok: false });
  });

  it("rejects an unknown kind", () => {
    expect(readSettingsFile(JSON.stringify({ kind: "something-else" }))).toEqual({ ok: false });
  });

  it("rejects an empty object", () => {
    expect(readSettingsFile("{}")).toEqual({ ok: false });
  });

  it("clamps an out-of-range design, bounds, and imposition to layable values", () => {
    const wild = JSON.stringify({
      kind: "bindery-project",
      version: 1,
      source: { name: "w.epub", byteLength: 1 },
      design: { font: { sizePt: 9999 } },
      bounds: { fontMinPt: -50, fontMaxPt: 9999 },
      imposition: { sheetsPerSignature: 3, flip: "sideways" },
    });
    const loaded = readSettingsFile(wild);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.design).toEqual(sanitizeDesign({ font: { sizePt: 9999 } }));
    expect(loaded.bounds).toEqual(sanitizeBounds({ fontMinPt: -50, fontMaxPt: 9999 }));
    // An unknown sheet count and flip fall back to the defaults.
    expect(loaded.imposition).toEqual(DEFAULT_IMPOSITION);
  });

  it("loads a project with a missing source (source undefined)", () => {
    const file = JSON.stringify({
      kind: "bindery-project",
      version: 1,
      design: {},
      bounds: {},
      imposition: {},
    });
    const loaded = readSettingsFile(file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.source).toBeUndefined();
  });

  it("accepts a version other than the current one", () => {
    const file = buildProject(source, design, bounds, imposition);
    const drifted = JSON.stringify({ ...file, version: 99 });
    expect(readSettingsFile(drifted).ok).toBe(true);
  });
});

describe("determinism", () => {
  it("serializes two builds of the same state to identical strings", () => {
    const a = JSON.stringify(buildProject(source, design, bounds, imposition));
    const b = JSON.stringify(buildProject(source, design, bounds, imposition));
    expect(a).toBe(b);
  });
});
