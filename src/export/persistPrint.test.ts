import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_IMPOSITION } from "./impose";
import { loadImposition, saveImposition, sanitizeImposition } from "./persistPrint";

beforeEach(() => localStorage.clear());

describe("sanitizeImposition", () => {
  it("returns the default for a non-object", () => {
    expect(sanitizeImposition(null)).toEqual(DEFAULT_IMPOSITION);
    expect(sanitizeImposition("nope")).toEqual(DEFAULT_IMPOSITION);
  });

  it("keeps a valid whole-sheet value and a known flip", () => {
    expect(sanitizeImposition({ imposition: { sheetsPerSignature: 2, flip: "short-edge" } })).toEqual({
      sheetsPerSignature: 2,
      flip: "short-edge",
    });
  });

  it("clamps an out-of-list sheet count back to the default", () => {
    expect(sanitizeImposition({ imposition: { sheetsPerSignature: 7, flip: "long-edge" } })).toEqual(
      DEFAULT_IMPOSITION,
    );
  });

  it("falls back to long edge for an unknown flip", () => {
    expect(sanitizeImposition({ imposition: { sheetsPerSignature: 4, flip: "diagonal" } }).flip).toBe(
      "long-edge",
    );
  });
});

describe("loadImposition / saveImposition", () => {
  it("round-trips through storage", () => {
    saveImposition({ sheetsPerSignature: 8, flip: "short-edge" });
    expect(loadImposition()).toEqual({ sheetsPerSignature: 8, flip: "short-edge" });
  });

  it("returns the default when nothing is stored", () => {
    expect(loadImposition()).toEqual(DEFAULT_IMPOSITION);
  });
});
