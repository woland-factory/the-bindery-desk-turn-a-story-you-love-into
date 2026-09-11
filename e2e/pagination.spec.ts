import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const large = join(here, "..", "test", "fixtures", "large");
const EMMA = join(large, "emma.epub");
const MIDDLEMARCH = join(large, "middlemarch.epub");

// Budgets (the kill condition): first feedback within 100ms, a settled exact
// result within about 2s on the ~300k-word book.
const FIRST_FEEDBACK_MS = 100;
const SETTLE_MS = 2000;
// The worker keeps the main thread free during the pass; the only main-thread
// work is delivering and rendering the first pages and the final result. A
// long task anywhere near the pass duration would mean the layout leaked onto
// the main thread. This threshold catches that regression with shared-host
// headroom.
const LONG_TASK_MS = 400;

interface Timings {
  wordCount: number;
  pageCount: number;
  firstFeedbackMs: number;
  settleMs: number;
}

interface Measured {
  timings: Timings;
  maxLongTaskMs: number;
}

async function runEngineOn(page: Page, fixture: string): Promise<Measured> {
  await page.addInitScript(() => {
    (window as unknown as { __LONGTASKS__: { start: number; dur: number }[] }).__LONGTASKS__ = [];
    try {
      new PerformanceObserver((list) => {
        const sink = (window as unknown as { __LONGTASKS__: { start: number; dur: number }[] })
          .__LONGTASKS__;
        for (const e of list.getEntries()) sink.push({ start: e.startTime, dur: e.duration });
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // longtask entries are Chromium-only; the budget asserts still run.
    }
  });

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fixture);

  // The structure view (book title, h1) renders once parse finishes, before
  // the engine pass starts. Mark that moment so long tasks from the EPUB
  // parse are excluded and only the engine pass is measured.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const passStart = await page.evaluate(() => performance.now());

  await page.waitForFunction(
    () => (window as unknown as { __BINDERY_ENGINE_TIMINGS__?: unknown }).__BINDERY_ENGINE_TIMINGS__ !== undefined,
    null,
    { timeout: 30_000 },
  );

  const timings = (await page.evaluate(
    () => (window as unknown as { __BINDERY_ENGINE_TIMINGS__: Timings }).__BINDERY_ENGINE_TIMINGS__,
  )) as Timings;

  const maxLongTaskMs = await page.evaluate((start) => {
    const tasks = (window as unknown as { __LONGTASKS__: { start: number; dur: number }[] })
      .__LONGTASKS__;
    let max = 0;
    for (const t of tasks) if (t.start >= start && t.dur > max) max = t.dur;
    return max;
  }, passStart);

  return { timings, maxLongTaskMs };
}

test("paginates the ~150k book (Emma) end to end within budget", async ({ page }) => {
  const { timings, maxLongTaskMs } = await runEngineOn(page, EMMA);
  console.log(`[perf] emma ${JSON.stringify({ ...timings, maxLongTaskMs })}`);

  expect(timings.wordCount).toBeGreaterThanOrEqual(150_000);
  expect(timings.pageCount).toBeGreaterThan(100);
  expect(timings.firstFeedbackMs).toBeLessThanOrEqual(FIRST_FEEDBACK_MS);
  expect(timings.settleMs).toBeLessThanOrEqual(SETTLE_MS);
});

test("paginates the ~300k book (Middlemarch) within the kill-condition budget", async ({ page }) => {
  const { timings, maxLongTaskMs } = await runEngineOn(page, MIDDLEMARCH);
  console.log(`[perf] middlemarch ${JSON.stringify({ ...timings, maxLongTaskMs })}`);

  expect(timings.wordCount).toBeGreaterThanOrEqual(300_000);
  expect(timings.pageCount).toBeGreaterThan(100);
  // The budgets that define the EPIC.
  expect(timings.firstFeedbackMs).toBeLessThanOrEqual(FIRST_FEEDBACK_MS);
  expect(timings.settleMs).toBeLessThanOrEqual(SETTLE_MS);
});

test("runs the pass in a worker, keeping the main thread responsive", async ({ page }) => {
  const { maxLongTaskMs } = await runEngineOn(page, MIDDLEMARCH);
  console.log(`[perf] middlemarch maxLongTaskMs ${maxLongTaskMs}`);
  expect(maxLongTaskMs).toBeLessThan(LONG_TASK_MS);
});

test("gives an identical page count across two runs on the 300k book", async ({ page }) => {
  const first = await runEngineOn(page, MIDDLEMARCH);
  const second = await runEngineOn(page, MIDDLEMARCH);
  expect(second.timings.pageCount).toBe(first.timings.pageCount);
});
