import { test, expect, type Page } from "@playwright/test";

// The 390px pass over the surfaces the existing budget/project mobile specs
// skip: the empty dropzone, the unreadable error, the structure view, the
// control panel, and the preview. For each: no horizontal scroll, the primary
// control clears a ~44px touch target, and body text stays readable (>=16px).
// Layout-only fixes belong in styles.css; this spec is the regression guard.

const PHONE = { width: 390, height: 780 };

/** Mark the first run done so the coach mark never overlaps a controls check. */
async function seedReturning(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bindery.firstRun", JSON.stringify({ v: 1, done: true }));
    } catch {
      // Storage unavailable: the test still runs, the tour simply shows.
    }
  });
}

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

async function bodyFontPx(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
}

test.use({ viewport: PHONE });

test("the empty dropzone fits at 390px", async ({ page }) => {
  await seedReturning(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Open a book to begin" })).toBeVisible();
  const choose = page.getByRole("button", { name: "Choose EPUB file" });
  expect((await choose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await bodyFontPx(page)).toBeGreaterThanOrEqual(16);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("the unreadable error fits at 390px", async ({ page }) => {
  await seedReturning(page);
  await page.goto("/");

  // A non-EPUB file forces the unreadable error surface immediately.
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-a-book.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("plain text, not an epub"),
  });

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("This file is not a readable EPUB.");
  const primary = page.getByRole("button", { name: "Try another file" });
  expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("the studio, its disclosures, and the structure view fit at 390px", async ({ page }) => {
  await seedReturning(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();

  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();

  // The paper-budget slider (its 44px touch row) and the primary Export action.
  const slider = page.getByLabel("Fit into");
  await expect(slider).toBeVisible();
  expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const exportButton = page.getByRole("button", { name: /^Export$/ });
  await expect(exportButton).toBeEnabled({ timeout: 30_000 });
  expect((await exportButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  expect(await bodyFontPx(page)).toBeGreaterThanOrEqual(16);
  expect(await noHorizontalScroll(page)).toBe(true);

  // Open both disclosures: the control panel's print setup and the budget
  // bounds. Neither may introduce a horizontal scrollbar.
  await page.locator(".panel__print > summary").click();
  await expect(page.getByLabel("Sheets per signature")).toBeVisible();
  await page.locator(".budget__bounds summary").click();
  await expect(page.getByLabel("Font size min (pt)")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);

  // The structure view below the studio: its primary action stays reachable.
  const another = page.getByRole("button", { name: "Open another book" });
  await another.scrollIntoViewIfNeeded();
  await expect(another).toBeVisible();
  expect((await another.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await noHorizontalScroll(page)).toBe(true);
});
