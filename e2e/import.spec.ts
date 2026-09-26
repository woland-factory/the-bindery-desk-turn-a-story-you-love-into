import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(here, "..", "public", "sample", "aesops-fables.epub");

test("first screen shows the product and its primary action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open a book to begin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose EPUB file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open the sample book" })).toBeVisible();
});

test("one tap on the sample renders parsed structure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();

  await expect(
    page.getByRole("heading", { name: "Aesop's Fables: A Small Selection" }),
  ).toBeVisible();
  await expect(page.getByText("The Hare and the Tortoise")).toBeVisible();
  await expect(page.getByText("The Crow and the Pitcher")).toBeVisible();
  await expect(page.getByText("5 chapters")).toBeVisible();
});

test("importing an EPUB file renders its structure", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);

  await expect(
    page.getByRole("heading", { name: "Aesop's Fables: A Small Selection" }),
  ).toBeVisible();
  await expect(page.getByText("The Lion and the Mouse")).toBeVisible();
});

test("usable at a 390px viewport with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();
  await expect(
    page.getByRole("heading", { name: "Aesop's Fables: A Small Selection" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("the first-run coach mark does not strand on the error screen", async ({ page }) => {
  await page.goto("/");

  // A brand-new visitor starts on step 1 of the guided run.
  await expect(page.getByText("Open the sample to see a real book.")).toBeVisible();

  // Opening the sample advances the coach mark to the slider step.
  await page.getByRole("button", { name: "Open the sample book" }).click();
  await expect(page.getByText("Drag the slider to pick your sheet count.")).toBeVisible();

  // Then a file that fails to parse unloads the book to the error state.
  // The studio mounts several file inputs, so target the EPUB one by label.
  await page.locator('input[aria-label="Upload EPUB file"]').setInputFiles({
    name: "broken.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from("this is not a zip, so the parse fails"),
  });

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("This file is not a readable EPUB.");

  // The coach mark tears down: no stale ring, no card over the error panel.
  await expect(page.getByText("Drag the slider to pick your sheet count.")).toHaveCount(0);
  await expect(page.locator(".walkthrough")).toHaveCount(0);

  // The recovery button is reachable, not covered by a floating card. A click
  // that lands (Playwright fails if the target is obscured) proves it.
  await alert.getByRole("button", { name: "Try another file" }).click();
});
