import { test, expect, type Locator, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MIDDLEMARCH = join(here, "..", "test", "fixtures", "large", "middlemarch.epub");

// The paper-budget budgets, matching the EPIC's kill condition.
const FIRST_FEEDBACK_MS = 100;
const SETTLE_MS = 2000;

interface Timings {
  wordCount: number;
  pageCount: number;
  firstFeedbackMs: number;
  settleMs: number;
}

const SETTLED_READOUT = /^(\d+) sheets? · /;

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

/** The settled sheet count the readout currently reports. */
async function readoutSheets(page: Page): Promise<number> {
  const readout = page.locator(".budget__readout");
  await expect(readout).toHaveText(SETTLED_READOUT, { timeout: 30_000 });
  const text = (await readout.textContent()) ?? "";
  return Number(SETTLED_READOUT.exec(text)?.[1]);
}

/**
 * Set the slider to one target in one input event, the way one drag tick
 * lands. `fill` refuses range inputs, so go through the native value setter
 * (the React-compatible path a real drag takes).
 */
async function dragTo(page: Page, target: number): Promise<void> {
  await page.getByLabel("Fit into").evaluate((el, value) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, target);
}

/** Reset the timings hook, run `act`, then read the fresh solve timings. */
async function measureSolve(page: Page, act: () => Promise<void>): Promise<Timings> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__BINDERY_ENGINE_TIMINGS__ = undefined;
  });
  await act();
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

test("the slider re-flows the 300k book within budget and lands within one sheet", async ({ page }) => {
  const region = await openMiddlemarch(page);
  await waitSettled(page);
  const before = await readoutSheets(page);

  // Scroll into the middle so we can prove the place is kept across the solve.
  const handle = await region.elementHandle();
  await handle!.evaluate((el) => el.scrollTo(0, el.scrollHeight / 3));
  expect(await handle!.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  const slider = page.getByLabel("Fit into");
  const min = Number(await slider.getAttribute("min"));
  const target = Math.max(min, Math.round(before * 0.8));
  expect(target).toBeLessThan(before - 1);

  const leaves = region.locator('[data-testid="page-leaf"]');
  const timings = await measureSolve(page, () => dragTo(page, target));

  console.log(`[budget] target ${target} from ${before}: ${JSON.stringify(timings)}`);
  expect(timings.firstFeedbackMs).toBeLessThanOrEqual(FIRST_FEEDBACK_MS);
  expect(timings.settleMs).toBeLessThanOrEqual(SETTLE_MS);

  // Exact landing: the settled readout is within one sheet of the target.
  const after = await readoutSheets(page);
  expect(Math.abs(after - target)).toBeLessThanOrEqual(1);

  // Never blanked: a page leaf stayed mounted and no skeleton appeared.
  await expect(leaves.first()).toBeVisible();
  expect(await region.locator(".leaf--skeleton").count()).toBe(0);

  // Place kept: scroll did not reset to the top.
  expect(await handle!.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test("pinched bounds report the exact reachable count and are never violated", async ({ page }) => {
  await openMiddlemarch(page);
  await waitSettled(page);
  await readoutSheets(page);

  // Pin the font to the top of its range and narrow spacing to one step: the
  // reachable range now starts far above the current book.
  await page.locator(".budget__bounds summary").click();
  await page.getByLabel("Font size min (pt)").fill("13");
  await page.getByLabel("Line spacing min").fill("1.55");

  // Ask for a sheet count far below what those bounds can reach. The range
  // still includes the current settled count, so the drag itself is honest.
  const slider = page.getByLabel("Fit into");
  const min = Number(await slider.getAttribute("min"));
  await dragTo(page, min + 1);

  const readout = page.locator(".budget__readout");
  await expect(readout).toHaveText(/Your bounds reach \d+ sheets at the tightest\. Loosen a bound to go lower\./, {
    timeout: 30_000,
  });
  const reach = Number(/reach (\d+) sheets/.exec((await readout.textContent()) ?? "")?.[1]);
  expect(reach).toBeGreaterThan(min + 2);

  // The applied design honors the pinched bounds and the margin floors.
  await expect(page.locator("#font-size")).toHaveValue("13");
  for (const id of ["#margin-inner", "#margin-outer", "#margin-top", "#margin-bottom"]) {
    expect(Number(await page.locator(id).inputValue())).toBeGreaterThanOrEqual(0.15);
  }
});

test("the dials follow the solver and the solved design survives a reload", async ({ page }) => {
  await openMiddlemarch(page);
  await waitSettled(page);
  const before = await readoutSheets(page);

  const slider = page.getByLabel("Fit into");
  const min = Number(await slider.getAttribute("min"));
  await dragTo(page, Math.max(min, Math.round(before * 0.8)));
  await expect(page.locator(".budget__readout")).toHaveText(SETTLED_READOUT, { timeout: 30_000 });

  // The dials now display the solver's choice, denser than the defaults.
  const fontSize = await page.locator("#font-size").inputValue();
  const spacing = await page.locator("#line-spacing").inputValue();
  expect(Number(fontSize)).toBeGreaterThanOrEqual(9);
  expect(Number(fontSize)).toBeLessThanOrEqual(13);
  expect(fontSize === "11" && spacing === "1.35").toBe(false);

  // The solved design persists through the existing design storage.
  await page.waitForTimeout(500); // let the debounced save land
  await page.reload();
  await openMiddlemarch(page);
  await expect(page.locator("#font-size")).toHaveValue(fontSize);
  await expect(page.locator("#line-spacing")).toHaveValue(spacing);
});

test("the sample book reaches the slider in the first minute with no file", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();

  const slider = page.getByLabel("Fit into");
  await expect(slider).toBeEnabled({ timeout: 30_000 });
  const before = await readoutSheets(page);

  // One keyboard drag: arrows commit exactly like a pointer drag.
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__BINDERY_ENGINE_TIMINGS__ = undefined;
  });
  await slider.focus();
  await slider.press("ArrowLeft");

  // The solve settled: the readout reports a real sheet count and the book
  // re-flowed through the engine.
  await expect(page.locator(".budget__readout")).toHaveText(SETTLED_READOUT, { timeout: 30_000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { __BINDERY_ENGINE_TIMINGS__?: unknown }).__BINDERY_ENGINE_TIMINGS__ !==
      undefined,
    null,
    { timeout: 30_000 },
  );
  const after = await readoutSheets(page);
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThanOrEqual(before);
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();
});

test("slider, readout, and open bounds are usable at 390px with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();

  await expect(page.getByLabel("Fit into")).toBeVisible();
  await expect(page.locator(".budget__readout")).toBeVisible();

  // The thumb's touch target clears 44px.
  const box = await page.getByLabel("Fit into").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await page.locator(".budget__bounds summary").click();
  for (const label of [
    "Font size min (pt)",
    "Font size max (pt)",
    "Line spacing min",
    "Line spacing max",
    "Margins min (%)",
    "Margins max (%)",
  ]) {
    await expect(page.getByLabel(label)).toBeVisible();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
