import type { Page } from "../engine/types";

// Pure grouping of pages into rows for display. Derived only from the page
// list and the view mode, never from the DOM. In spread mode a row is
// [verso, recto]; because sideForIndex(0) === 'recto', page 0 sits alone on
// the right of the first spread with an empty left leaf (outside the book).
// In single mode each page is its own row.

export type ViewMode = "single" | "spread";

/** A display row. A null slot is an empty leaf outside the book. */
export type Spread = (Page | null)[];

export function groupSpreads(pages: Page[], mode: ViewMode): Spread[] {
  if (mode === "single") return pages.map((page) => [page]);
  if (pages.length === 0) return [];

  // spread 0 = [null, page0]; spread k>=1 = [page(2k-1), page(2k)].
  const spreads: Spread[] = [[null, pages[0]]];
  for (let i = 1; i < pages.length; i += 2) {
    spreads.push([pages[i], pages[i + 1] ?? null]);
  }
  return spreads;
}
