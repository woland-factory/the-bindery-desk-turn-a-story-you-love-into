import { test, expect, type Page } from "@playwright/test";

// The keyboard half of the accessibility audit (QUALITY BAR §6): every control
// the studio offers is reachable by Tab, and each stop shows a visible focus
// ring. The contrast, label, and semantics halves are proven in the jsdom
// suite (src/theme/contrast.test.ts, src/a11y.test.tsx).

interface Stop {
  tag: string;
  id: string | null;
  name: string | null;
  outlineStyle: string;
  outlineWidth: string;
}

async function seedReturning(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bindery.firstRun", JSON.stringify({ v: 1, done: true }));
    } catch {
      // Storage unavailable: the test still runs, the tour simply shows.
    }
  });
}

/** Info about whatever the keyboard just landed on, or null for body/none. */
async function activeStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      id: el.id || null,
      name: el.getAttribute("aria-label") || (el.textContent ?? "").trim().slice(0, 40) || null,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
    };
  });
}

test("the keyboard reaches every studio control, each with a visible focus ring", async ({
  page,
}) => {
  await seedReturning(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open the sample book" }).click();
  const region = page.getByRole("region", { name: "Book preview" });
  await expect(region.locator('[data-testid="page-leaf"]').first()).toBeVisible();
  await expect(page.getByLabel("Fit into")).toBeEnabled({ timeout: 30_000 });

  // Start from a clean slate, then Tab through the studio.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

  const stops: Stop[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const stop = await activeStop(page);
    if (stop) stops.push(stop);
    // The structure view's "Open another book" is the last control in DOM
    // order; once seen, the tour of the studio is complete.
    if (stop?.name === "Open another book") break;
  }

  expect(stops.length).toBeGreaterThan(5);

  // Every interactive stop draws a focus ring (styles.css :focus-visible).
  for (const stop of stops) {
    if (["INPUT", "SELECT", "BUTTON", "A", "SUMMARY"].includes(stop.tag)) {
      expect(stop.outlineStyle, `${stop.tag} ${stop.id ?? stop.name}`).not.toBe("none");
      expect(parseFloat(stop.outlineWidth), `${stop.tag} ${stop.id ?? stop.name}`).toBeGreaterThan(0);
    }
  }

  // The load-bearing controls are all reachable by keyboard alone.
  const ids = new Set(stops.map((s) => s.id).filter(Boolean));
  const names = stops.map((s) => s.name);
  expect(ids.has("budget-target"), "slider").toBe(true);
  expect(ids.has("font"), "font select").toBe(true);
  expect(ids.has("font-size"), "font size").toBe(true);
  expect(ids.has("margin-inner"), "inner margin").toBe(true);
  expect(names).toContain("Export");
  expect(names).toContain("Reset to defaults");
  expect(names).toContain("Open another book");
});
