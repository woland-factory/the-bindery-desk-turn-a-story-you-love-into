import { describe, it, expect, afterEach } from "vitest";
import { readRuntimeConfig } from "./runtimeConfig";

afterEach(() => {
  delete window.__BINDERY_CONFIG__;
});

describe("readRuntimeConfig", () => {
  it("returns all-empty when the global is missing", () => {
    expect(readRuntimeConfig()).toEqual({ sentryDsn: "", umamiUrl: "", umamiWebsiteId: "" });
  });

  it("reads and trims provided values", () => {
    window.__BINDERY_CONFIG__ = {
      sentryDsn: "  https://k@e/1 ",
      umamiUrl: "https://u/s.js",
      umamiWebsiteId: "id-1",
    };
    expect(readRuntimeConfig()).toEqual({
      sentryDsn: "https://k@e/1",
      umamiUrl: "https://u/s.js",
      umamiWebsiteId: "id-1",
    });
  });

  it("ignores non-string fields defensively", () => {
    window.__BINDERY_CONFIG__ = { sentryDsn: 123 as unknown as string };
    expect(readRuntimeConfig().sentryDsn).toBe("");
  });
});
