import { test, expect, type Download, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const MIDDLEMARCH = join(here, "..", "test", "fixtures", "large", "middlemarch.epub");

// The export button reads "Export" at idle and names the phase while running.
const EXPORT_IDLE = /^Export$/;

async function openSample(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();
}

async function openMiddlemarch(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(MIDDLEMARCH);
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();
}

/** Load saved bytes with pdf-lib to prove a real, openable PDF. */
async function pageCountOf(download: Download): Promise<number> {
  const path = await download.path();
  const bytes = await readFile(path);
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/** Collect every download the page fires until `count` have arrived. */
function collectDownloads(page: Page): Download[] {
  const list: Download[] = [];
  page.on("download", (d) => list.push(d));
  return list;
}

test("the sample exports two valid PDFs from one click, no file needed", async ({ page }) => {
  await openSample(page);
  const downloads = collectDownloads(page);

  const exportButton = page.getByRole("button", { name: EXPORT_IDLE });
  await expect(exportButton).toBeEnabled({ timeout: 30_000 });
  await exportButton.click();

  await expect(page.locator(".panel__status")).toHaveText("Saved two files.", { timeout: 30_000 });
  await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(2);

  const names = downloads.map((d) => d.suggestedFilename()).sort();
  expect(names).toEqual([
    expect.stringMatching(/-signatures\.pdf$/),
    expect.stringMatching(/-typeset\.pdf$/),
  ]);

  for (const d of downloads) {
    expect(await pageCountOf(d)).toBeGreaterThan(0);
  }

  // A visible fallback link is offered for each file as well.
  await expect(page.getByRole("link", { name: "Save typeset PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Save signatures PDF" })).toBeVisible();
});

test("export builds both PDFs in the tab and never uploads the book", async ({ page }) => {
  await openSample(page);
  const origin = new URL(page.url()).origin;

  const offOrigin: string[] = [];
  const bodied: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== origin) offOrigin.push(url);
    if (req.postData()) bodied.push(`${req.method()} ${url}`);
  });

  const downloads = collectDownloads(page);
  await page.getByRole("button", { name: EXPORT_IDLE }).click();
  await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(2);

  // No cross-origin request and no request carried a body: the book bytes
  // never left the tab. The only network calls are same-origin asset GETs.
  expect(offOrigin).toEqual([]);
  expect(bodied).toEqual([]);
});

test("the 300k book exports with progress and a live surface", async ({ page }) => {
  await openMiddlemarch(page);
  await expect(page.locator(".preview__count")).toHaveText(/\d{3,} pages/, { timeout: 60_000 });

  // A rAF counter proves the main thread keeps painting during the export.
  await page.evaluate(() => {
    const w = window as unknown as { __FRAMES__: number };
    w.__FRAMES__ = 0;
    const tick = () => {
      w.__FRAMES__ += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const downloads = collectDownloads(page);
  const exportButton = page.getByRole("button", { name: EXPORT_IDLE });
  await expect(exportButton).toBeEnabled({ timeout: 60_000 });
  await exportButton.click();

  // The button becomes busy and names the typesetting phase with a page count.
  await expect(page.locator(".panel__export")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".panel__export")).toHaveText(/Typesetting page \d+ of \d+/, {
    timeout: 30_000,
  });

  const framesMid = await page.evaluate(() => (window as unknown as { __FRAMES__: number }).__FRAMES__);

  await expect(page.locator(".panel__status")).toHaveText("Saved two files.", { timeout: 120_000 });
  await expect.poll(() => downloads.length, { timeout: 120_000 }).toBe(2);

  const framesEnd = await page.evaluate(() => (window as unknown as { __FRAMES__: number }).__FRAMES__);
  // The surface kept painting through the export: frames advanced, not frozen.
  expect(framesEnd).toBeGreaterThan(framesMid);

  for (const d of downloads) {
    expect(await pageCountOf(d)).toBeGreaterThan(0);
  }
});

test("print setup changes the imposition and still exports two files", async ({ page }) => {
  await openSample(page);

  await page.locator(".panel__print summary").click();
  await page.getByLabel("Duplex flip").selectOption("short-edge");
  await page.getByLabel("Sheets per signature").selectOption("2");

  const downloads = collectDownloads(page);
  await page.getByRole("button", { name: EXPORT_IDLE }).click();
  await expect(page.locator(".panel__status")).toHaveText("Saved two files.", { timeout: 30_000 });
  await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(2);

  for (const d of downloads) {
    expect(await pageCountOf(d)).toBeGreaterThan(0);
  }
});

test("the Export control and print setup are usable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openSample(page);

  const exportButton = page.getByRole("button", { name: EXPORT_IDLE });
  await expect(exportButton).toBeVisible();
  const box = await exportButton.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await page.locator(".panel__print summary").click();
  await expect(page.getByLabel("Sheets per signature")).toBeVisible();
  await expect(page.getByLabel("Duplex flip")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
