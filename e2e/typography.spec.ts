import { test, expect, type Locator, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MIDDLEMARCH = join(here, "..", "test", "fixtures", "large", "middlemarch.epub");

// The re-flow budgets, matching the engine's kill condition.
const FIRST_FEEDBACK_MS = 100;
const SETTLE_MS = 2000;

interface Timings {
  wordCount: number;
  pageCount: number;
  firstFeedbackMs: number;
  settleMs: number;
}

async function openMiddlemarch(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(MIDDLEMARCH);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();
  return region;
}

/** Wait until the book has fully settled (three-digit page count). */
async function waitSettled(page: Page): Promise<void> {
  await expect(page.locator(".preview__count")).toHaveText(/\d{3,} pages/, { timeout: 30_000 });
}

/** Reset the timings hook, run `act`, then read the fresh re-flow timings. */
async function measureReflow(page: Page, act: () => Promise<void>): Promise<Timings> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__BINDERY_ENGINE_TIMINGS__ = undefined;
  });
  await act();
  await page.waitForFunction(
    () => (window as unknown as { __BINDERY_ENGINE_TIMINGS__?: unknown }).__BINDERY_ENGINE_TIMINGS__ !== undefined,
    null,
    { timeout: 30_000 },
  );
  return page.evaluate(
    () => (window as unknown as { __BINDERY_ENGINE_TIMINGS__: Timings }).__BINDERY_ENGINE_TIMINGS__,
  );
}

async function textOffset(leaf: Locator): Promise<number> {
  const leafBox = await leaf.boundingBox();
  const textBox = await leaf.locator('[data-testid="text-area"]').boundingBox();
  if (!leafBox || !textBox) throw new Error("missing leaf geometry");
  return textBox.x - leafBox.x;
}

test("re-flows the whole book within budget, without blanking or losing place", async ({ page }) => {
  const region = await openMiddlemarch(page);
  await waitSettled(page);

  // Scroll into the middle so we can prove the place is kept across the swap.
  const handle = await region.elementHandle();
  await handle!.evaluate((el) => el.scrollTo(0, el.scrollHeight / 3));
  const beforeTop = await handle!.evaluate((el) => el.scrollTop);
  expect(beforeTop).toBeGreaterThan(0);

  const leaves = region.locator('[data-testid="page-leaf"]');
  const timings = await measureReflow(page, async () => {
    await page.getByLabel("Font size").fill("14");
  });

  console.log(`[typography] reflow ${JSON.stringify(timings)}`);
  expect(timings.firstFeedbackMs).toBeLessThanOrEqual(FIRST_FEEDBACK_MS);
  expect(timings.settleMs).toBeLessThanOrEqual(SETTLE_MS);

  // Never blanked: a page leaf stayed mounted and no skeleton appeared.
  await expect(leaves.first()).toBeVisible();
  expect(await region.locator(".leaf--skeleton").count()).toBe(0);

  // Place kept: scroll did not reset to the top.
  const afterTop = await handle!.evaluate((el) => el.scrollTop);
  expect(afterTop).toBeGreaterThan(0);
});

test("switching page size re-mirrors margins and re-widths the column", async ({ page }) => {
  const region = await openMiddlemarch(page);
  await waitSettled(page);

  const firstLeaf = region.locator('[data-testid="page-leaf"]').first();
  const beforeWidth = (await firstLeaf.locator('[data-testid="text-area"]').boundingBox())!.width;

  await measureReflow(page, async () => {
    await page.getByLabel("Page size").selectOption({ label: "US Trade" });
  });
  await waitSettled(page);

  // Column width changed with the new trim.
  const afterWidth = (await firstLeaf.locator('[data-testid="text-area"]').boundingBox())!.width;
  expect(Math.abs(afterWidth - beforeWidth)).toBeGreaterThan(1);

  // Margins still mirror: the recto's text sits further from its edge (inner
  // gutter) than the verso's.
  const verso = region.locator('[data-testid="page-leaf"][data-side="verso"]').first();
  const recto = region.locator('[data-testid="page-leaf"][data-side="recto"]').first();
  await expect(verso).toBeVisible();
  await expect(recto).toBeVisible();
  expect(await textOffset(recto)).toBeGreaterThan(await textOffset(verso));
});

test("a curated font renders on screen and drives pagination", async ({ page }) => {
  const region = await openMiddlemarch(page);
  await waitSettled(page);
  const beforeCount = await page.evaluate(
    () => (window as unknown as { __BINDERY_ENGINE_TIMINGS__: Timings }).__BINDERY_ENGINE_TIMINGS__.pageCount,
  );

  const timings = await measureReflow(page, async () => {
    await page.getByLabel("Font", { exact: true }).selectOption({ label: "EB Garamond" });
  });

  // The worker measured the real face, so the page count moved.
  expect(timings.pageCount).not.toBe(beforeCount);

  // The face loaded on the main thread and a rendered line resolves to it.
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('700 12px "EB Garamond"')), { timeout: 15_000 })
    .toBe(true);
  const family = await region
    .locator(".leaf__line")
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain("EB Garamond");
});

test("the panel is usable at 390px with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openMiddlemarch(page);

  await expect(page.getByRole("region", { name: "Book design" })).toBeVisible();
  await expect(page.getByLabel("Font size")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("settings persist across a reload", async ({ page }) => {
  await openMiddlemarch(page);
  await waitSettled(page);

  await page.getByLabel("Font size").fill("15");
  await page.getByLabel("Line spacing").fill("1.5");
  // Let the debounced save land before reloading.
  await page.waitForTimeout(500);

  await page.reload();
  await openMiddlemarch(page);

  await expect(page.getByLabel("Font size")).toHaveValue("15");
  await expect(page.getByLabel("Line spacing")).toHaveValue("1.5");
});
