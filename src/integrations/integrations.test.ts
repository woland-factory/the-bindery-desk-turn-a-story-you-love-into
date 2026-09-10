import { describe, it, expect, vi, beforeEach } from "vitest";
import { initSentry, type SentryClient } from "./sentry";
import { initUmami } from "./umami";
import type { RuntimeConfig } from "../config/runtimeConfig";

const EMPTY: RuntimeConfig = { sentryDsn: "", umamiUrl: "", umamiWebsiteId: "" };

describe("initSentry", () => {
  it("does nothing and loads no client when no DSN is set", async () => {
    const loader = vi.fn();
    const started = await initSentry(EMPTY, loader as unknown as () => Promise<SentryClient>);
    expect(started).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it("initializes with PII disabled when a DSN is present", async () => {
    const init = vi.fn();
    const loader = async (): Promise<SentryClient> => ({ init });
    const started = await initSentry({ ...EMPTY, sentryDsn: "https://k@example/1" }, loader);

    expect(started).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    const opts = init.mock.calls[0][0];
    expect(opts.dsn).toBe("https://k@example/1");
    expect(opts.sendDefaultPii).toBe(false);
  });

  it("beforeSend scrubs request, user, breadcrumbs and extras", async () => {
    const init = vi.fn();
    await initSentry({ ...EMPTY, sentryDsn: "https://k@example/1" }, async () => ({ init }));
    const beforeSend = init.mock.calls[0][0].beforeSend;

    const event = {
      request: { url: "file:///Users/someone/secret-book.epub", data: "body text" },
      user: { id: "a", username: "reader" },
      breadcrumbs: [{ message: "opened My Private Novel.epub" }],
      extra: { title: "My Private Novel", author: "A. Fan" },
      contexts: { state: { document: "full chapter text" } },
    };
    const scrubbed = beforeSend({ ...event }, {});

    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.extra).toEqual({});
    expect(scrubbed.contexts?.state).toBeUndefined();
  });
});

describe("initUmami", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("injects no script when config is absent", () => {
    expect(initUmami(EMPTY)).toBe(false);
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("injects no script when only one of url/id is set", () => {
    expect(initUmami({ ...EMPTY, umamiUrl: "https://u/script.js" })).toBe(false);
    expect(initUmami({ ...EMPTY, umamiWebsiteId: "abc" })).toBe(false);
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("injects the page-load script with the website id when fully configured", () => {
    const started = initUmami({
      ...EMPTY,
      umamiUrl: "https://u/script.js",
      umamiWebsiteId: "site-123",
    });
    expect(started).toBe(true);
    const script = document.head.querySelector("script")!;
    expect(script.getAttribute("src")).toBe("https://u/script.js");
    expect(script.getAttribute("data-website-id")).toBe("site-123");
  });
});
