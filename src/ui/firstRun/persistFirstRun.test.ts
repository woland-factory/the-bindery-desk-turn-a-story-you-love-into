import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isFirstRunDone, markFirstRunDone } from "./persistFirstRun";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("persistFirstRun", () => {
  it("returns false when nothing is stored", () => {
    expect(isFirstRunDone()).toBe(false);
  });

  it("round-trips the done flag", () => {
    markFirstRunDone();
    expect(isFirstRunDone()).toBe(true);
    localStorage.clear();
    expect(isFirstRunDone()).toBe(false);
  });

  it("returns false for a malformed stored value", () => {
    localStorage.setItem("bindery.firstRun", "not json");
    expect(isFirstRunDone()).toBe(false);
    localStorage.setItem("bindery.firstRun", JSON.stringify({ v: 1, done: false }));
    expect(isFirstRunDone()).toBe(false);
  });

  it("swallows a storage write error", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => markFirstRunDone()).not.toThrow();
  });
});
