import { test, expect, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Project files, house-style presets, and the guided first run, driven end to
// end against the production build. Only the sample EPUB is committed, so the
// cross-book house-style proof lives in the T3 unit test (two documents); here
// the sample stands in for a real book.

const SETTLED_READOUT = /^(\d+) sheets? · /;

/** Mark the first run done so the tour never interferes with a controls test. */
async function seedReturning(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bindery.firstRun", JSON.stringify({ v: 1, done: true }));
    } catch {
      // Storage unavailable: the test still runs, the tour simply shows.
    }
  });
}

async function openSample(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();
  await expect(page.getByLabel("Fit into")).toBeEnabled({ timeout: 30_000 });
}

async function readoutSheets(page: Page): Promise<number> {
  const readout = page.locator(".budget__readout");
  await expect(readout).toHaveText(SETTLED_READOUT, { timeout: 30_000 });
  return Number(SETTLED_READOUT.exec((await readout.textContent()) ?? "")?.[1]);
}

async function openProjectDisclosure(page: Page): Promise<void> {
  await page.getByText("Project and presets").click();
}

test("a project round-trips the changed dial and the sheet count", async ({ page }) => {
  await seedReturning(page);
  await openSample(page);

  // The settled default count, stable with no re-flow pending.
  const base = await readoutSheets(page);

  // A distinctive change, then wait for the re-flow to land away from the
  // default before reading the count (the readout shows the stale default until
  // the font-16 re-flow settles).
  await page.locator("#font-size").fill("16");
  await expect(page.locator("#font-size")).toHaveValue("16");
  await expect.poll(() => readoutSheets(page), { timeout: 30_000 }).not.toBe(base);
  const sheets = await readoutSheets(page);

  await openProjectDisclosure(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save project" }).click(),
  ]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/-project\.json$/);

  // Reset the design away, then open the project to restore it exactly.
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.locator("#font-size")).toHaveValue("11");

  await page.locator('input[aria-label="Open project file"]').setInputFiles(path);
  await expect(page.getByText("Project loaded.")).toBeVisible();
  await expect(page.locator("#font-size")).toHaveValue("16");
  // Poll past the re-flow: the readout briefly shows the reset count before the
  // restored design settles back to the saved sheet count.
  await expect.poll(() => readoutSheets(page), { timeout: 30_000 }).toBe(sheets);
});

test("a mismatched source is reported plainly and still applies", async ({ page }) => {
  await seedReturning(page);
  await openSample(page);

  await page.locator("#font-size").fill("15");
  await expect(page.locator("#font-size")).toHaveValue("15");

  await openProjectDisclosure(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save project" }).click(),
  ]);
  const saved = JSON.parse(await readFile(await download.path(), "utf8"));
  // Alter the source hash so the opened project claims a different book.
  saved.source.sha256 = "0".repeat(64);

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.locator("#font-size")).toHaveValue("11");

  await page.locator('input[aria-label="Open project file"]').setInputFiles({
    name: "mismatch-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });

  await expect(
    page.getByText("Settings applied. This project came from a different book."),
  ).toBeVisible();
  // The settings still apply: they are book-agnostic.
  await expect(page.locator("#font-size")).toHaveValue("15");
});

test("a house style saves and applies, re-paginating the book", async ({ page }) => {
  await seedReturning(page);
  await openSample(page);

  await page.locator("#font-size").fill("14");
  await expect(page.locator("#font-size")).toHaveValue("14");

  await openProjectDisclosure(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save house style" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-housestyle\.json$/);

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.locator("#font-size")).toHaveValue("11");

  await page.locator('input[aria-label="Apply house style file"]').setInputFiles(await download.path());
  await expect(page.getByText("House style applied.")).toBeVisible();
  await expect(page.locator("#font-size")).toHaveValue("14");
  // The preview re-paginated without error: a real sheet count is reported.
  expect(await readoutSheets(page)).toBeGreaterThan(0);
});

/** Collect every download the page fires. */
function collectDownloads(page: Page): Download[] {
  const list: Download[] = [];
  page.on("download", (d) => list.push(d));
  return list;
}

test("the walkthrough walks a new visitor from open to export, then never returns", async ({
  page,
}) => {
  await page.goto("/");
  // Step 1 points at opening a book.
  await expect(page.getByText("Open the sample to see a real book.")).toBeVisible();

  await page.getByRole("button", { name: "Open the sample book" }).click();
  // Step 2 points at the slider.
  await expect(page.getByText("Drag the slider to pick your sheet count.")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Click Export to save your two PDFs.")).toBeVisible();

  const downloads = collectDownloads(page);
  const exportButton = page.getByRole("button", { name: /^Export$/ });
  await expect(exportButton).toBeEnabled({ timeout: 30_000 });
  await exportButton.click();

  await expect(page.locator(".panel__status")).toHaveText("Saved two files.", { timeout: 60_000 });
  await expect.poll(() => downloads.length, { timeout: 60_000 }).toBe(2);

  // The first export ends the tour.
  await expect(page.getByText("Click Export to save your two PDFs.")).toBeHidden();

  // A reload does not show it again.
  await page.reload();
  await expect(page.getByText("Open the sample to see a real book.")).toBeHidden();
});

test("Skip dismisses the walkthrough and it stays gone after a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Open the sample to see a real book.")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("Open the sample to see a real book.")).toBeHidden();

  await page.reload();
  await expect(page.getByText("Open the sample to see a real book.")).toBeHidden();
});

test("project controls and the walkthrough are usable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");

  // The walkthrough card is reachable at 390px (docked to the bottom).
  await expect(page.getByText("Open the sample to see a real book.")).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip" });
  expect((await skip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await skip.click();

  await page.getByRole("button", { name: "Open the sample book" }).click();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();

  await openProjectDisclosure(page);
  for (const name of ["Save project", "Open project", "Save house style", "Apply house style"]) {
    // exact:true so "Open project" does not also match the "Open project file"
    // hidden input, which the accessibility tree exposes as a button.
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
