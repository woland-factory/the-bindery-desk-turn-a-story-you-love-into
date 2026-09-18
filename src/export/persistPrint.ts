import {
  DEFAULT_IMPOSITION,
  SHEETS_PER_SIGNATURE_OPTIONS,
  type ImpositionOptions,
} from "./impose";

// Session persistence of the print-setup options (sheets per signature and the
// duplex flip). No target, no design, no book text, no PII. The blob is
// versioned and read with a forward-compatible merge onto DEFAULT_IMPOSITION,
// then clamped to valid whole-sheet values and a known flip, so a blob written
// by any version loads in any other. Every localStorage touch is guarded, so
// private-mode or disabled storage degrades silently.

const KEY = "bindery.print";
const VERSION = 1;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Merge stored keys forward onto DEFAULT_IMPOSITION and clamp to valid values. */
export function sanitizeImposition(raw: unknown): ImpositionOptions {
  const d = DEFAULT_IMPOSITION;
  if (!isObject(raw)) return { ...d };
  const source = isObject(raw.imposition) ? raw.imposition : raw;
  const sheets = source.sheetsPerSignature;
  const sheetsPerSignature =
    typeof sheets === "number" && (SHEETS_PER_SIGNATURE_OPTIONS as readonly number[]).includes(sheets)
      ? sheets
      : d.sheetsPerSignature;
  const flip = source.flip === "short-edge" ? "short-edge" : "long-edge";
  return { sheetsPerSignature, flip };
}

/** Read the stored options, or DEFAULT_IMPOSITION when nothing valid is stored. */
export function loadImposition(): ImpositionOptions {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_IMPOSITION };
    const stored = localStorage.getItem(KEY);
    if (!stored) return { ...DEFAULT_IMPOSITION };
    return sanitizeImposition(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_IMPOSITION };
  }
}

/** Persist the options. Never throws. */
export function saveImposition(imposition: ImpositionOptions): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, imposition }));
  } catch {
    // Storage disabled or full: degrade to in-memory silently.
  }
}
