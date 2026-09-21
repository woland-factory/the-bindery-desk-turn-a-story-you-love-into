// The first-run flag. One boolean under `bindery.firstRun`, guarded so
// private-mode or disabled storage degrades to in-memory: the tour then shows
// this session and simply does not persist its dismissal. Holds no book data.

const KEY = "bindery.firstRun";
const VERSION = 1;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** True only when a valid done flag is stored; false on anything else. */
export function isFirstRunDone(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) && parsed.done === true;
  } catch {
    return false;
  }
}

/** Mark the first run complete. Never throws. */
export function markFirstRunDone(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, done: true }));
  } catch {
    // Storage disabled or full: the session-level dismissal still holds.
  }
}
