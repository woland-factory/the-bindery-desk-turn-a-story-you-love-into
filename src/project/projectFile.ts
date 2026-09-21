import type { DesignSpec } from "../engine/types";
import type { BudgetBounds } from "../engine/budget";
import type { ImpositionOptions } from "../export/impose";
import { sanitizeDesign } from "../ui/design/persistDesign";
import { sanitizeBounds } from "../ui/budget/persistBudget";
import { sanitizeImposition } from "../export/persistPrint";

// The project and house-style file model, with pure serialize and parse. A
// project file references its source book by a content hash and byte length,
// never by its bytes: the book is never inside the file. Parsing reuses the
// three existing sanitizers, so a partial, out-of-range, or hand-edited file
// still yields a layable design or a plain error, never a crash. No Date.now
// and no randomness, so two saves of the same state are byte-identical.

export const PROJECT_KIND = "bindery-project";
export const HOUSESTYLE_KIND = "bindery-housestyle";
export const FILE_VERSION = 1;

export interface SourceRef {
  name: string;
  sha256?: string;
  byteLength: number;
}

export interface ProjectFile {
  kind: typeof PROJECT_KIND;
  version: number;
  source: SourceRef;
  design: DesignSpec;
  bounds: BudgetBounds;
  imposition: ImpositionOptions;
}

export interface HouseStyle {
  kind: typeof HOUSESTYLE_KIND;
  version: number;
  design: DesignSpec;
  bounds: BudgetBounds;
  imposition: ImpositionOptions;
}

/** What the UI applies, regardless of which file kind was opened. */
export interface LoadedSettings {
  ok: true;
  origin: "project" | "housestyle";
  design: DesignSpec;
  bounds: BudgetBounds;
  imposition: ImpositionOptions;
  /** Present only for a project file. */
  source?: SourceRef;
}

export interface LoadError {
  ok: false;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** A clean source ref carrying only the reference fields, no book bytes. */
function cleanSource(source: SourceRef): SourceRef {
  const ref: SourceRef = { name: source.name, byteLength: source.byteLength };
  if (source.sha256) ref.sha256 = source.sha256;
  return ref;
}

/** Read a source object defensively into a SourceRef. */
function readSource(raw: unknown): SourceRef | undefined {
  if (!isObject(raw)) return undefined;
  const name = typeof raw.name === "string" ? raw.name : "";
  const byteLength =
    typeof raw.byteLength === "number" && Number.isFinite(raw.byteLength) ? raw.byteLength : 0;
  const ref: SourceRef = { name, byteLength };
  if (typeof raw.sha256 === "string") ref.sha256 = raw.sha256;
  return ref;
}

/** Build a project file from the current book source and working settings. */
export function buildProject(
  source: SourceRef,
  design: DesignSpec,
  bounds: BudgetBounds,
  imposition: ImpositionOptions,
): ProjectFile {
  return {
    kind: PROJECT_KIND,
    version: FILE_VERSION,
    source: cleanSource(source),
    design,
    bounds,
    imposition,
  };
}

/** Build a settings-only house-style file (no source). */
export function buildHouseStyle(
  design: DesignSpec,
  bounds: BudgetBounds,
  imposition: ImpositionOptions,
): HouseStyle {
  return {
    kind: HOUSESTYLE_KIND,
    version: FILE_VERSION,
    design,
    bounds,
    imposition,
  };
}

/**
 * Parse an opened file's text into the settings to apply, or a plain error.
 * Every value is clamped through the existing sanitizers, and a higher or
 * lower `version` is accepted (the sanitizers absorb shape drift).
 */
export function readSettingsFile(text: string): LoadedSettings | LoadError {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!isObject(raw)) return { ok: false };

  const origin =
    raw.kind === PROJECT_KIND ? "project" : raw.kind === HOUSESTYLE_KIND ? "housestyle" : null;
  if (origin === null) return { ok: false };

  const settings: LoadedSettings = {
    ok: true,
    origin,
    design: sanitizeDesign(raw.design),
    bounds: sanitizeBounds(raw.bounds),
    imposition: sanitizeImposition(raw.imposition),
  };
  if (origin === "project") settings.source = readSource(raw.source);
  return settings;
}
