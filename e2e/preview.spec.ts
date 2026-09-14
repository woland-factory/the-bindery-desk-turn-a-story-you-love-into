import { test, expect, type Locator, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MIDDLEMARCH = join(here, "..", "test", "fixtures", "large", "middlemarch.epub");

// The virtualization budget: however long the book, only a small window of
// leaves is ever mounted. Spread mode mounts at most a few rows of two leaves
// plus overscan, so this bound holds at the top, middle, and end.
const MOUNTED_BOUND = 16;

async function openMiddlemarch(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(MIDDLEMARCH);
  // The structure view h1 renders once the parse finishes.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();
  return region;
}

/** Left offset of a leaf's text area relative to the leaf itself. */
async function textOffset(leaf: Locator): Promise<number> {
  const leafBox = await leaf.boundingBox();
  const textBox = await leaf.locator('[data-testid="text-area"]').boundingBox();
  if (!leafBox || !textBox) throw new Error("missing leaf geometry");
  return textBox.x - leafBox.x;
}

test("keeps mounted leaves bounded while scrolling a 300+ page book", async ({ page }) => {
  const region = await openMiddlemarch(page);
  // Wait for the settled count so the whole book is virtualized, not streaming.
  await expect(page.locator(".preview__count")).toHaveText(/\d{3,} pages/);

  const leaves = region.locator('[data-testid="page-leaf"]');
  await expect.poll(() => leaves.count()).toBeLessThanOrEqual(MOUNTED_BOUND);

  const handle = await region.elementHandle();
  await handle!.evaluate((el) => el.scrollTo(0, el.scrollHeight / 2));
  await expect.poll(() => leaves.count()).toBeLessThanOrEqual(MOUNTED_BOUND);

  await handle!.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect.poll(() => leaves.count()).toBeLessThanOrEqual(MOUNTED_BOUND);
});

test("mirrors margins: recto text starts further from its edge than verso", async ({ page }) => {
  const region = await openMiddlemarch(page);
  const verso = region.locator('[data-testid="page-leaf"][data-side="verso"]').first();
  const recto = region.locator('[data-testid="page-leaf"][data-side="recto"]').first();
  await expect(verso).toBeVisible();
  await expect(recto).toBeVisible();
  // Inner (gutter) margin is larger than the outer margin, so the recto's text
  // block sits further right within its leaf.
  expect(await textOffset(recto)).toBeGreaterThan(await textOffset(verso));
});

test("shows chrome on body pages, suppresses it on openers, opens recto", async ({ page }) => {
  const region = await openMiddlemarch(page);
  await expect(page.locator(".preview__count")).toHaveText(/\d{3,} pages/);

  // The first chapter opener is mounted at the top: recto, no header or folio.
  const opener = region.locator('[data-testid="page-leaf"][data-kind="opener"]').first();
  await expect(opener).toBeVisible();
  expect(await opener.locator(".leaf__chrome").count()).toBe(0);
  await expect(opener).toHaveAttribute("data-side", "recto");

  // The first pages are short chapter openers and blanks; scroll into the book
  // so body pages mount, then confirm their header and folio.
  const handle = await region.elementHandle();
  await handle!.evaluate((el) => el.scrollTo(0, el.scrollHeight / 2));

  const body = region.locator('[data-testid="page-leaf"][data-kind="body"]').first();
  await expect(body).toBeVisible();
  await expect(body.locator(".leaf__folio")).toBeVisible();
  await expect(body.locator(".leaf__runhead")).toBeVisible();
});

test("first spread paints well under the engine settle budget", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(MIDDLEMARCH);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const start = await page.evaluate(() => performance.now());
  await expect(
    page.getByRole("region", { name: "Book preview" }).locator('[data-testid="page-leaf"]').first(),
  ).toBeVisible();
  const elapsed = (await page.evaluate(() => performance.now())) - start;
  console.log(`[preview] first leaf visible after parse in ${Math.round(elapsed)}ms`);
  // The streamed first pages paint the first spread long before the ~2s settle.
  expect(elapsed).toBeLessThan(1500);
});

test("usable at 390px: single-page mode and no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const region = await openMiddlemarch(page);

  // Single mode has no empty outside-book leaf (that belongs to spread mode).
  await expect(region.locator('[data-testid="empty-leaf"]')).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
