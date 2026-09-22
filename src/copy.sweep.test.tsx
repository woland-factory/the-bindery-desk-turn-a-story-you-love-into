import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import App from "./App";
import { ImportSurface } from "./ui/ImportSurface";
import { LoadingState } from "./ui/LoadingState";
import { ErrorState } from "./ui/ErrorState";
import { StructureView } from "./ui/StructureView";
import { emptyReport } from "./model/importReport";
import type { Document } from "./model/document";
import { markFirstRunDone } from "./ui/firstRun/persistFirstRun";

// One comprehensive, permanent copy sweep over the surfaces that had no sweep
// of their own: the import dropzone, the loading state, all three error kinds,
// the structure view, and the app shell. Book/user data is exempt (QUALITY BAR
// §8 sweeps product copy, not the reader's book), so every fixture here feeds
// neutral, dash-free data and the sweep judges only the product's own strings.

vi.mock("./fonts/loadFonts", () => ({ warmCatalog: vi.fn(() => Promise.resolve()) }));

const EM_EN_DASH = /[—–]/;
const BANNED =
  /seamless|effortless|unlock|elevate|empower|leverage|robust|dive in|in today's fast-paced world|we've got you covered/i;
const NEGATIVE = /you don't have|no .* yet|nothing .* here|unable to|something went wrong/i;

/** Every product-copy string a surface renders: text nodes plus the attributes
 *  a user can read (labels, placeholders, titles, alt text). */
function copyStrings(container: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent ?? "").trim();
    if (text) out.push(text);
    node = walker.nextNode();
  }
  for (const el of container.querySelectorAll("*")) {
    for (const attr of ["aria-label", "placeholder", "title", "alt"]) {
      const value = el.getAttribute(attr);
      if (value && value.trim()) out.push(value.trim());
    }
  }
  return out;
}

function expectClean(strings: string[]) {
  for (const s of strings) {
    expect(s, `em/en dash in: ${s}`).not.toMatch(EM_EN_DASH);
    expect(s, `banned vocabulary in: ${s}`).not.toMatch(BANNED);
    expect(s, `negative phrasing in: ${s}`).not.toMatch(NEGATIVE);
  }
}

beforeEach(() => {
  localStorage.clear();
});

describe("copy sweep: import dropzone", () => {
  it("reads clean", () => {
    const { container } = render(
      <ImportSurface onFile={() => {}} onChooseFile={() => {}} onOpenSample={() => {}} />,
    );
    expectClean(copyStrings(container));
  });
});

describe("copy sweep: loading state", () => {
  it("reads clean for a named file and the sample", () => {
    const named = render(<LoadingState name="a-neutral-name" />);
    expectClean(copyStrings(named.container));
    const sample = render(<LoadingState name="sample" />);
    expectClean(copyStrings(sample.container));
  });
});

describe("copy sweep: error states", () => {
  it("reads clean for every kind", () => {
    for (const kind of ["unreadable", "too-large", "sample-failed"] as const) {
      const { container, unmount } = render(
        <ErrorState error={{ kind }} maxMb={64} onChooseFile={() => {}} onOpenSample={() => {}} />,
      );
      expectClean(copyStrings(container));
      unmount();
    }
  });
});

describe("copy sweep: structure view", () => {
  it("reads clean with neutral book data", () => {
    const doc: Document = {
      title: "A Neutral Title",
      author: "A Neutral Author",
      language: "en",
      chapters: [
        { id: "c1", title: "First Section", order: 0, blocks: [] },
        { id: "c2", title: "Second Section", order: 1, blocks: [] },
      ],
      source: { name: "book", byteLength: 0 },
    };
    const { container } = render(
      <StructureView document={doc} report={emptyReport()} onReset={() => {}} />,
    );
    expectClean(copyStrings(container));
  });
});

describe("copy sweep: app shell", () => {
  it("reads clean on the first screen (returning visitor, no tour)", () => {
    // A returning visitor never sees the tour, so this sweeps the shell and the
    // empty state; the walkthrough copy is swept in its own component test.
    markFirstRunDone();
    const { container } = render(<App />);
    expectClean(copyStrings(container));
  });
});
