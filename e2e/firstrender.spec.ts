import { test, expect, type Page } from "@playwright/test";

// Perceived-speed budgets (QUALITY BAR §1 and the quality differentiator):
// first meaningful render under ~1s, and interaction feedback under 100ms.
// These run on the production build the webServer serves.
const FIRST_RENDER_MS = 1000;
const FIRST_FEEDBACK_MS = 100;

const SETTLED_READOUT = /^(\d+) sheets? · /;

interface Timings {
  wordCount: number;
  pageCount: number;
  firstFeedbackMs: number;
  settleMs: number;
}

/** Wait for the engine to publish a fresh timings record and return it. */
async function waitTimings(page: Page): Promise<Timings> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __BINDERY_ENGINE_TIMINGS__?: unknown }).__BINDERY_ENGINE_TIMINGS__ !==
      undefined,
    null,
    { timeout: 30_000 },
  );
  return page.evaluate(
    () => (window as unknown as { __BINDERY_ENGINE_TIMINGS__: Timings }).__BINDERY_ENGINE_TIMINGS__,
  );
}

test("first meaningful render lands under ~1s", async ({ page }) => {
  // Record, navigation-relative, the moment the empty-state heading first
  // appears in the DOM. performance.now() here is measured from the page's
  // time origin (navigation start), so it is immune to test-runner latency.
  await page.addInitScript(() => {
    const w = window as unknown as { __HEADING_MS__: number | null };
    w.__HEADING_MS__ = null;
    const tick = () => {
      const h = document.querySelector("h1");
      if (h && (h.textContent ?? "").includes("Open a book to begin")) {
        w.__HEADING_MS__ = performance.now();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open a book to begin" })).toBeVisible();

  const headingMs = await page.evaluate(
    () => (window as unknown as { __HEADING_MS__: number | null }).__HEADING_MS__,
  );
  const fcp = await page.evaluate(() => {
    const entry = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
    return entry ? entry.startTime : null;
  });

  console.log(`[firstrender] heading ${headingMs}ms, FCP ${fcp}ms`);

  expect(headingMs).not.toBeNull();
  expect(headingMs as number).toBeLessThan(FIRST_RENDER_MS);
  expect(fcp).not.toBeNull();
  expect(fcp as number).toBeLessThan(FIRST_RENDER_MS);
});

test("a dial change gives feedback under 100ms and never blanks the book", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();
  const region = page.getByRole("region", { name: "Book preview" });
  const leaves = region.locator('[data-testid="page-leaf"]');
  await expect(leaves.first()).toBeVisible();
  await expect(page.locator(".budget__readout")).toHaveText(SETTLED_READOUT, { timeout: 30_000 });

  // Reset the timings hook so we read this dial change's own first feedback.
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__BINDERY_ENGINE_TIMINGS__ = undefined;
  });

  // Change a dial that re-flows the whole book (font size affects pagination).
  await page.locator("#font-size").fill("13");
  const timings = await waitTimings(page);
  console.log(`[firstrender] dial feedback ${JSON.stringify(timings)}`);

  // The differentiator: perceptible feedback well under a tenth of a second.
  expect(timings.firstFeedbackMs).toBeLessThanOrEqual(FIRST_FEEDBACK_MS);

  // Never blanked: a page leaf stayed mounted through the re-flow and no
  // skeleton (the blank-book placeholder) ever appeared.
  await expect(leaves.first()).toBeVisible();
  expect(await region.locator(".leaf--skeleton").count()).toBe(0);

  // The re-flow affordance exists: the book region carries aria-busy so a
  // screen reader learns the layout is updating.
  await expect(region).toHaveAttribute("aria-busy", /true|false/);
});
