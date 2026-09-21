import { describe, it, expect } from "vitest";
import { sourceId } from "./sourceId";

const enc = new TextEncoder();

describe("sourceId", () => {
  it("returns a 64-character lowercase hex string", async () => {
    const hex = await sourceId(enc.encode("a small book"));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes identical bytes to the same value", async () => {
    const a = await sourceId(enc.encode("the same bytes"));
    const b = await sourceId(enc.encode("the same bytes"));
    expect(a).toBe(b);
  });

  it("hashes one flipped byte to a different value", async () => {
    const a = await sourceId(new Uint8Array([1, 2, 3, 4]));
    const b = await sourceId(new Uint8Array([1, 2, 3, 5]));
    expect(a).not.toBe(b);
  });

  it("returns undefined without crypto.subtle, and does not throw", async () => {
    const original = globalThis.crypto;
    // Remove subtle to simulate a context that lacks Web Crypto.
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      await expect(sourceId(enc.encode("x"))).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
