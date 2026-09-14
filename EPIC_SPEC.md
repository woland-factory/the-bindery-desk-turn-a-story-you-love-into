# EPIC SPEC — Live facing-page preview

> EPIC 3 of The Bindery Desk. This is the screen the north star opens on: a
> binder drops their file and, before touching a setting, sees a book worth
> printing. Facing pages, mirrored margins across the gutter, running
> headers, folios, chapters opening recto. It consumes the pagination
> engine's output from EPIC 2 (read-only) and turns each `Page`'s per-line
> geometry into a real, book-shaped, virtualized surface: geometry computed
> for the whole book, only the visible spreads in the DOM.
>
> This EPIC adds NO typography controls (EPIC 4), NO paper-budget slider
> (EPIC 5), NO export (EPIC 6), and it does not edit the text. It renders one
> fixed design (`DEFAULT_DESIGN`) beautifully and fast, and it replaces the
> throwaway `EnginePreview` end to end.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control, above all
the paper-budget slider (later EPICs), must re-flow the entire book with
perceptible feedback under 100ms and settle within about two seconds on a
300k-word novel. We do not out-feature InDesign. We make control immediate
and reversible in a way no free path (Word, Calibre, Reedsy) offers.

**What it demands of THIS EPIC:** the renderer is the surface every future
re-flow paints onto, so it must stay O(visible spreads), never O(page
count), on every event:

- **First paint** of the first spread comes from the engine's streamed
  `firstPages` (the `progress` message), so a book shows its shape within
  the 100ms first-feedback window and never blocks on the full pass.
- **Scrolling** a 300-page book keeps only the visible spreads (plus a small
  overscan) mounted, so node count and per-frame work stay bounded and the
  scroll never janks.
- **Swapping the result** (progress → done now; a re-paginated result from
  EPIC 4/5 later) re-renders only the visible spreads. The design of this
  component is what keeps EPIC 5's slider inside its budget, so no code path
  here may walk or mount all pages. If the renderer became O(page count) on
  any update, the differentiator would die in the next EPIC.

The engine already hits the 100ms / ~2s budgets (EPIC 2, measured). This
EPIC must not regress them: the main thread's only new work is rendering the
first spread and the visible window, both bounded.

---

## 1. Scope

### In scope
1. **A virtualized facing-page renderer.** Given a `PaginationResult` (the
   whole book's pages, already laid out by the engine) and the active
   `DesignSpec`, render a scrollable book surface that computes each spread's
   position from the page count but mounts only the spreads in view (plus a
   small overscan). Node count stays bounded regardless of book length.
2. **Correct book conventions, rendered from the engine's geometry:**
   - **Mirrored margins.** The engine gives each `Line` an `x`/`y`/`width`
     relative to the page's *text area* (the rectangle inside the margins)
     and a constant column width. This EPIC places that text area on the
     physical page per side: a **verso** (left page) carries the inner
     (gutter) margin on its right and the outer margin on its left; a
     **recto** (right page) mirrors it. Inner margins face each other across
     the gutter.
   - **Running headers.** A verso shows `runningHeader.verso`, a recto shows
     `runningHeader.recto`, with `{title}`, `{author}`, and `{chapter}`
     tokens resolved from the `Document`.
   - **Folios** (page numbers), one per body page.
   - **Suppression.** Running headers and folios are suppressed on
     chapter-opening pages (`kind: 'opener'`) and on inserted blanks
     (`kind: 'blank'`). Blanks render as fully empty leaves. A suppressed
     page still consumes its folio number, so numbering downstream stays
     correct.
   - **Chapters open recto.** The engine already guarantees every opener
     lands on a recto (inserting a blank verso where needed); this EPIC
     renders that faithfully, including the empty left leaf of the very first
     spread.
3. **Responsive layout (mobile-first).** A single page at narrow widths
   (usable at a 390px viewport), a facing spread at wider widths. Switching
   modes on resize re-groups pages for display without re-paginating (page
   geometry is unchanged; only grouping and scale change).
4. **Designed empty, loading, and error states** for the preview surface:
   a layout-stable skeleton spread while the engine lays out, a
   product-voice error with a next step, and an empty state (a file that
   produces zero pages) that names the surface's purpose and first action.
5. **A minimal print stylesheet** that prints the on-screen preview at true
   trim size (`@media print`), so a binder can pull one physical test spread
   and confirm the mirrored-margin alignment. This is an alignment check
   only, not the PDF/imposition export (EPIC 6): no imposition, no signature
   folding, no download, no page-order remapping.
6. **Replacement of the throwaway preview.** Delete `src/ui/EnginePreview.tsx`
   and `src/ui/EnginePreview.test.tsx`; wire the new `BookPreview` into
   `App.tsx` in their place. Keep the existing `load` → `paginate` flow and
   the `__BINDERY_ENGINE_TIMINGS__` hook intact so EPIC 2's perf harness
   still passes.

### Out of scope (Non-Goals — building any is a defect)
- **Typography / layout controls (EPIC 4).** No trim-size, font, margin,
  spacing, header-text, or toggle UI. No dials, no settings panel, no way for
  the user to change the design. This EPIC renders `DEFAULT_DESIGN` only.
- **The paper-budget solver and slider (EPIC 5).** No "fit into N sheets", no
  slider, no search over the design space, no re-pagination triggered by user
  input.
- **Imposition / signatures / export (EPIC 6).** No fold-to-signature math,
  no PDF, no download, no re-ordering of pages into printer bundles. The
  print stylesheet in §5 prints pages in reading order at true size for an
  alignment check only.
- **Editing the text**, re-parsing, or any change to the `Document` model
  (`src/model/document.ts`) or the parser.
- **Any change to the pagination engine** (`src/engine/*`): the renderer is a
  pure consumer of `PaginationResult`, `DesignSpec`, `computeMetrics`, and
  `units`. If the renderer appears to need a new engine field, that is a
  signal to reconsider the render approach, not to edit the engine. (If it is
  genuinely unavoidable, mark the run `blocked` rather than expanding scope.)
- **Rendering images into pages.** Images are already dropped from flow by
  EPIC 1; the engine emits only `heading`/`paragraph`/`note` text.
- **A first-run walkthrough / guided path (EPIC 7).** Do not build the
  onboarding tour here. This EPIC must not *regress* EPIC 1's first-run: the
  sample still loads, and now shows a real book-shaped preview.
- **Persistence, project files, house-style presets (EPIC 7).**
- **Any runtime LLM.** The product has no text-generation feature.

---

## 2. Technical design

### 2.1 What already exists (consume, do not change)
- `src/engine/types.ts` — `DesignSpec`, `Page` (`index`, `side`, `kind`,
  `chapterIndex`, `lines`), `Line` (`text`, `x`, `y`, `width`, `hyphenated`),
  `PaginationResult` (`pageCount`, `pages`), `Timings`.
- `src/engine/defaultDesign.ts` — `DEFAULT_DESIGN` (half-letter trim 5.5×8.5
  in; inner 0.75, outer 0.5, top 0.6, bottom 0.7 in; opener top drop 72pt,
  `startRecto: true`; `runningHeader.verso = '{author}'`,
  `runningHeader.recto = '{title}'`, `showOnOpener: false`).
- `src/engine/units.ts` — `PX_PER_IN` (96), `PX_PER_PT`, `lengthToPx`,
  `ptToPx`, `roundPx`. Reuse these so the renderer's px basis matches the
  engine's exactly.
- `src/engine/paginate.ts` — `computeMetrics(design)` returns `columnPx`,
  `lineHeightPx`, `bodyLinesPerPage`, `openerLinesPerPage`, `openerTopDropPx`,
  `bodyStyle`, `headingStyle`; `sideForIndex(index)` (`index % 2 === 0` →
  `'recto'`). Reuse both for consistency; do not re-derive column width.
- `src/engine/client.ts` — `EngineClient` / `EngineClientLike`:
  `load(doc)`, `paginate(design, handlers)`, `dispose()`. Handlers:
  `onProgress(estimatedPageCount, firstPages, firstFeedbackMs)`,
  `onDone(result, timings)`, `onError(message)`. It measures timings and
  publishes `window.__BINDERY_ENGINE_TIMINGS__` on `done`. Keep using it as
  the throwaway preview did.
- `src/engine/engine.ts` — `FIRST_PAGES` (4): the count carried in
  `progress.firstPages`. Enough to fill the first spread.
- `src/engine/lineBreak.ts` — `SOFT_HYPHEN`: the char the engine inserts for
  a soft hyphen. The renderer strips it and shows a real hyphen when
  `line.hyphenated` (the throwaway preview's `displayText` is the pattern to
  reuse).

### 2.2 New file / module layout (nothing in `src/engine` or `src/model` changes)
```
src/ui/
  BookPreview.tsx        container: owns the EngineClient, drives load/paginate,
                         holds the {laying-out | first-spread | ready | empty | error}
                         states, and renders the virtualized viewport
  BookPreview.test.tsx
  bookScroller.ts        pure windowing: (spreadCount, spreadStridePx, scrollTop,
                         viewportPx, overscan) -> { firstSpread, lastSpread, topPadPx,
                         totalPx }. No DOM, unit-tested.
  bookScroller.test.ts
  spreads.ts             pure grouping: pages -> Spread[] (verso/recto pairing,
                         leading half-spread) for spread mode; identity list for
                         single-page mode. Unit-tested.
  spreads.test.ts
  pageGeometry.ts        pure: (design, side) -> PagePlacement (page px box, mirrored
                         text-left, text-top, header/folio anchors). Reuses units +
                         computeMetrics. Unit-tested.
  pageGeometry.test.ts
  runningHead.ts         pure token resolver: (template, {title, author, chapter}) ->
                         string. Unit-tested.
  runningHead.test.ts
  PageView.tsx           renders one Page: mirrored margins, header, folio, lines,
                         scaled to fit. Presentational, pure over its props.
  Spread.tsx             renders one spread (verso + recto) or a single page row.
src/styles.css           add facing-page + viewport styles; remove throwaway .preview* rules
src/App.tsx              swap EnginePreview -> BookPreview (delete the throwaway files)
e2e/preview.spec.ts      Playwright: bounded nodes while scrolling, 390px no h-scroll,
                         mirrored margins, header/folio suppression, first-spread speed
```
No new runtime dependency. React + the existing engine are sufficient; do not
add a virtualization or windowing library (the window math is a dozen lines,
§2.6). Do not add an animation or layout framework.

### 2.3 Page geometry (`pageGeometry.ts`, pure)
All lengths in CSS px on the engine's basis (`units.ts`). The engine's
`Line.x`/`Line.y` are relative to the text area; this module places that text
area on the physical page.

```ts
export interface PagePlacement {
  pageWidthPx: number;    // lengthToPx(trim.w, unit)
  pageHeightPx: number;   // lengthToPx(trim.h, unit)
  textLeftPx: number;     // verso: outer margin; recto: inner margin
  textTopPx: number;      // lengthToPx(margins.top, unit)
  columnPx: number;       // computeMetrics(design).columnPx (constant per design)
  textHeightPx: number;   // lengthToPx(trim.h - margins.top - margins.bottom, unit)
  lineHeightPx: number;   // computeMetrics(design).lineHeightPx
  fontSizePx: number;     // ptToPx(font.sizePt)
  headingSizePx: number;  // ptToPx(font.sizePt) with bold (headings share size here)
  // Header/folio sit on one line inside the top margin band.
  chromeBaselinePx: number;  // y of the header/folio baseline, inside the top margin
  folioEdge: 'left' | 'right'; // outer edge: verso -> 'left', recto -> 'right'
}

export function pagePlacement(design: DesignSpec, side: PageSide): PagePlacement;
```

Rules:
- `textLeftPx` is the mirror: `side === 'verso' ? outerPx : innerPx`, where
  `innerPx = lengthToPx(margins.inner, unit)` and
  `outerPx = lengthToPx(margins.outer, unit)`. `columnPx` is constant, so the
  text block width is identical on both sides; only its left offset differs.
- `chromeBaselinePx` sits within the top margin (e.g. `textTopPx * 0.55`),
  above the text area, so the header never collides with body text.
- `folioEdge` places the folio at the page's **outer** edge on the chrome
  line (verso → left/outer, recto → right/outer); the running head is
  centered across `columnPx`.

Unit test pins: for `DEFAULT_DESIGN`, `pageWidthPx === 528`,
`pageHeightPx === 816`; verso `textLeftPx === lengthToPx(0.5,'in')` (outer),
recto `textLeftPx === lengthToPx(0.75,'in')` (inner); both sides share the
same `columnPx` from `computeMetrics`; `folioEdge` mirrors by side.

### 2.4 Running head tokens (`runningHead.ts`, pure)
```ts
export function resolveRunningHead(
  template: string,
  ctx: { title: string; author: string; chapter: string },
): string;
```
Replace `{title}`, `{author}`, `{chapter}` (case-sensitive, exact tokens)
with the context values; leave unknown tokens as-is (harmless literal). An
empty resolved string renders no header text (the chrome line still reserves
its space so layout stays stable). `chapter` for a page is
`orderedChapters(doc)[page.chapterIndex]?.title ?? ''`; a blank page
(`chapterIndex === -1`) never shows a header anyway.

Copy note: header text is book data (title/author/chapter), not product
copy, so it is exempt from the copy sweep. The default templates resolve to
the author on the verso and the title on the recto.

### 2.5 Rendering one page (`PageView.tsx`)
Presentational and pure over its props: `{ page, design, doc, scale }`.

- Outer element is a fixed box of `pageWidthPx × pageHeightPx`, scaled by
  `transform: scale(var(--scale))` with `transform-origin: top left`; its
  laid-out footprint is the scaled size (wrap in a box sized to the scaled
  dimensions so flow/scroll math uses on-screen pixels). This keeps every
  child positioned in true design px while the whole leaf shrinks to fit.
- **Text area:** a positioned box at `left: textLeftPx; top: textTopPx`,
  width `columnPx`, height `textHeightPx`, `overflow: hidden`.
- **Lines:** for each `Line`, an absolutely-positioned element at
  `left: line.x; top: line.y` within the text area (so the opener top-drop,
  already baked into `line.y` by the engine, is honored), rendered at
  `font-family: design.font.family`, `font-size: fontSizePx`
  (`headingSizePx` + bold for a heading block if distinguishable; body size
  is acceptable since the engine used one size), `white-space: pre`,
  `line-height: lineHeightPx`. Reproduce the soft hyphen exactly as the
  throwaway preview did: strip `SOFT_HYPHEN`, then append a visible `-` when
  `line.hyphenated`. Because the engine measured against the same family and
  size, each `Line` renders on one visual line at ≈`line.width`.
  Baseline note: align text so its baseline sits near `line.y` (a fixed
  line-box of `lineHeightPx` with a consistent vertical offset); uniform
  rhythm plus correct margins is what the AC checks, not sub-pixel baseline.
- **Chrome (header + folio):** rendered ONLY when
  `page.kind === 'body'`. On `opener` and `blank`, render neither (the
  space is simply empty). A body page shows:
  - running head: `resolveRunningHead(side === 'verso' ? runningHeader.verso :
    runningHeader.recto, ctx)`, centered across `columnPx` on the chrome line.
  - folio: `String(page.index + 1)` at the outer edge (`folioEdge`).
- **Blank page:** an empty leaf (a bordered/paper-colored box with no chrome
  and no lines), so the recto-opening convention is visible in the spread.

`PageView` never reads `pages` beyond its own `page`. It is O(lines on one
page).

### 2.6 Virtualized viewport (`bookScroller.ts` + `BookPreview.tsx`)
The preview is its own vertically-scrolling viewport (a bounded-height
scroll region, so virtualization has a stable frame and the surrounding page
layout is undisturbed).

- **Spread grouping (`spreads.ts`):** in spread mode, pages pair as
  `[verso, recto]` with the recto always on the right. Because
  `sideForIndex(0) === 'recto'`, page 0 sits alone on the right of the first
  spread with an **empty left leaf** (outside the book): spread 0 =
  `[null, page0]`, spread 1 = `[page1, page2]`, spread k≥1 =
  `[page(2k-1), page(2k)]`. In single-page mode each page is its own row, in
  index order. Grouping is pure and derived from `pageCount`/`pages`.
- **Windowing (`bookScroller.ts`):** every spread row has the same stride
  (`spreadStridePx` = scaled page height + row gap; the tallest leaf sets the
  height and all rows share it, so positions are a simple multiple). Given
  `scrollTop` and the viewport height, compute the first and last visible
  spread indices, add an overscan of 1–2 rows each side, and return
  `{ firstSpread, lastSpread, topPadPx, totalPx }`. The scroll container
  holds a spacer of `totalPx`; only spreads in `[firstSpread, lastSpread]`
  are mounted, offset by `topPadPx` (a translate or a top pad). This is the
  whole virtualization; no library.
- **Scroll handling:** listen passively, read `scrollTop`, and recompute the
  window inside a `requestAnimationFrame` (coalesce multiple scroll events
  into one update per frame). Never touch or measure all pages on scroll.
- **Resize / mode switch:** recompute `scale` and grouping on container
  resize (a `ResizeObserver` on the viewport, or a matchMedia breakpoint).
  Anchor scroll to the currently-centered page index so the reader does not
  lose their place across a single↔spread switch. Do NOT re-paginate.
- **Scale:** fit the leaf to the available width. Single mode:
  `scale = min(maxScale, (availableWidthPx) / pageWidthPx)`. Spread mode:
  `scale = min(maxScale, (availableWidthPx - gutterPx - gaps) / 2 /
  pageWidthPx)`. Cap `maxScale` (e.g. 1.1) so the book does not balloon on a
  wide monitor. Choose the single↔spread breakpoint so both pages stay
  readable in spread mode (recommended: single below ~820px CSS px, spread
  at/above); at 390px the app is in single mode with one readable page and
  no horizontal scroll.

### 2.7 State machine (`BookPreview.tsx`)
Props: `{ document, onReset, createEngine? }` (inject a fake engine in tests,
exactly like the throwaway preview). On mount / when `document` changes:
`engine.load(document)` then `engine.paginate(DEFAULT_DESIGN, handlers)`;
`dispose()` on unmount.

States:
- `laying-out` — before the first `progress`. Render a **skeleton spread**
  at the same dimensions the real spread will occupy (fixed leaf boxes,
  shimmering), so the layout holds and nothing jumps.
- `first-spread` — on `onProgress`: render the streamed `firstPages` through
  the real spread renderer immediately (the sub-100ms paint). The viewport
  may show just the first spread until the full result arrives.
- `ready` — on `onDone`: swap in the full `result.pages` and enable
  virtualized scrolling over the whole book. Optionally show the exact page
  count as a small, quiet label (book data, swept copy).
- `empty` — on `onDone` when `result.pageCount === 0` (a file that is all
  front matter / boilerplate): a designed empty state naming the surface's
  purpose and a first action (`onReset` → open another book).
- `error` — on `onError`: a designed, product-voice error with a next step
  (retry via `onReset`).

The swap from `first-spread`/`progress` pages to `ready` pages must reuse the
same spread/page components so there is no visible reflow flash, and must not
mount the whole book (virtualization applies the moment `ready` begins).

### 2.8 App wiring & deletions (`App.tsx`, `styles.css`)
- Replace `<EnginePreview document={state.document} />` with
  `<BookPreview document={state.document} onReset={reset} />` inside the
  `ready` branch. `StructureView` stays (EPIC 1's honest parse view); the
  facing-page preview renders below it as the primary surface. `reset` is the
  existing `() => setState({ status: 'empty' })`.
- Delete `src/ui/EnginePreview.tsx` and `src/ui/EnginePreview.test.tsx`
  (EPIC 2 declared them throwaway, replaced whole here).
- Remove the throwaway `.preview*` rules from `styles.css` and add the
  facing-page/viewport styles. Keep the shared design tokens and the
  `prefers-reduced-motion` skeleton handling.

### 2.9 Accessibility
- The viewport is a labeled region (`role="region"`, `aria-label="Book
  preview"`), keyboard-scrollable (`tabindex={0}`, visible focus via the
  existing `:focus-visible` rule), so keyboard reaches the book a mouse can.
- Provide a screen-reader summary of the settled page count (e.g. an
  `aria-live="polite"` or sr-only text: `{n} pages`) so a non-visual user
  learns the book's size even though only visible spreads are in the DOM.
- Page chrome and body text are real text nodes (readable by AT). Decorative
  leaf borders and the skeleton are `aria-hidden`. No images are flowed, so
  no alt text is required.
- Color contrast uses the existing tokens; the loading skeleton respects
  `prefers-reduced-motion`.

### 2.10 Determinism / privacy
- The renderer is pure over `(PaginationResult, DesignSpec, Document)`:
  identical inputs produce identical DOM. No `Math.random`, no `Date.now` in
  layout; timing readouts (if any) come from the engine's `Timings`.
- No file text appears in any error, log, or timing hook (errors are
  product-voice and file-free, matching the engine's protocol). No network
  path is added; the whole surface runs on already-parsed, in-browser data.

---

## 3. Ordered task list (each maps to acceptance criteria)

### T1 — Pure geometry + tokens + grouping + windowing
Create `pageGeometry.ts`, `runningHead.ts`, `spreads.ts`, `bookScroller.ts`
with their `*.test.ts`. All pure, jsdom-safe, no React.
**AC:** `typecheck` + `lint` pass. `pagePlacement` mirrors `textLeftPx`
(verso outer, recto inner) and `folioEdge` by side, and matches
`computeMetrics().columnPx`; `DEFAULT_DESIGN` yields 528×816 px leaf.
`resolveRunningHead` substitutes `{title}/{author}/{chapter}` and leaves
unknown tokens intact. `spreads.ts` pairs verso/recto with the leading
half-spread (`[null, page0]`) and gives an index list in single mode.
`bookScroller.ts` returns a bounded `[firstSpread, lastSpread]` window with
overscan and the correct `topPadPx`/`totalPx` for given `scrollTop`.

### T2 — PageView (one page, mirrored margins, chrome, scaled)
Implement `PageView.tsx` (§2.5) and `Spread.tsx` (§2.6 rendering half).
**AC:** a verso renders its text block at the outer-margin offset and a recto
at the inner-margin offset (inner margins face the gutter); a `body` page
shows a running head (correct verso/recto template resolved) and a folio at
the outer edge; an `opener` and a `blank` show neither header nor folio; a
`blank` shows an empty leaf; the soft hyphen renders as a visible `-` only
when `line.hyphenated`. Proven in `BookPreview.test.tsx` / a `PageView` test
with crafted pages.

### T3 — Virtualized viewport + responsive grouping
Implement the scroll viewport in `BookPreview.tsx` using `bookScroller.ts`
and `spreads.ts`: bounded-height scroll region, spacer of `totalPx`, mount
only the visible window, rAF-coalesced scroll updates, `ResizeObserver`/media
breakpoint driving single↔spread mode and `scale`.
**AC:** with a 300+ page result, the number of mounted page nodes stays below
a small bound at the top, after scrolling to the middle, and after scrolling
to the end (unit test drives `scrollTop` / the windowing hook and asserts the
mounted count); switching between single and spread mode re-groups without
re-calling `paginate`.

### T4 — BookPreview state machine + engine wiring
Implement the `{laying-out | first-spread | ready | empty | error}` machine
(§2.7): `load` + `paginate(DEFAULT_DESIGN)`, render streamed `firstPages`
immediately, swap to the full result on `done`, handle `empty` (zero pages)
and `error`, dispose on unmount. Injectable `createEngine` for tests.
**AC (Vitest, fake engine mirroring `EnginePreview.test.tsx`):** the
laying-out skeleton renders before any callback and holds layout; a
`progress` call paints the first spread; a `done` call shows the full book
with bounded mounted nodes; a zero-page `done` shows the empty state with its
action; `onError` shows the product-voice error; the engine is disposed on
unmount. Copy sweep test (no `—`/`–`, no banned vocabulary, no negative
empty-state openers) over the surface's own strings.

### T5 — App wiring, deletions, styles
Swap `EnginePreview` → `BookPreview` in `App.tsx`; delete the throwaway
component and its test; replace `.preview*` CSS with facing-page/viewport
styles; add the `@media print` true-trim stylesheet (§5 scope item, alignment
check only).
**AC:** `App.test.tsx` and `states.test.tsx` still pass; the ready state
renders `StructureView` + `BookPreview`; the throwaway files are gone;
`typecheck`/`lint`/`test` green.

### T6 — Mobile-first + accessibility pass
Verify and, where needed, adjust: 390px single-page mode with no horizontal
scroll, body text readable without zoom, any interactive target ≥ ~44px;
labeled scroll region, keyboard scroll, visible focus, sr-only page-count
summary, reduced-motion skeleton.
**AC:** covered by the e2e 390px assertions (T7) and a jsdom a11y check
(region label present, page-count summary present, chrome suppressed on
opener/blank). No horizontal overflow at 390px.

### T7 — Playwright preview harness (`e2e/preview.spec.ts`)
Drive the production build: import the large ~300k fixture (Middlemarch,
already committed under `test/fixtures/large/`), enter the preview, and
assert:
- **Bounded nodes while scrolling:** mounted page-leaf count stays below a
  small bound at the top, mid-scroll, and at the end of a 300+ page book.
- **Mirrored margins:** measure the rendered text-block left offset on a
  verso vs a recto and assert the mirror (verso outer, recto inner).
- **Chrome + suppression:** a body page shows a header and a folio; an opener
  and a blank show neither; chapters open recto (opener leaves have
  `side === 'recto'`).
- **390px:** at a 390px viewport, `document.scrollWidth <= clientWidth` (no
  horizontal scroll) and single-page mode is active.
- **First spread speed:** the first spread paints within the first-feedback
  window (reuse the streamed-progress path; assert the first leaf is visible
  well under the engine's settle time).
**AC:** all assertions pass in Chromium; `e2e/pagination.spec.ts` (EPIC 2's
budget/determinism harness) still passes unchanged, because the timings hook
and the `load`→`paginate` flow are preserved.

### T8 — README + copy sweep
Update `README.md` "Right now it…" paragraph and the code-map to describe the
live facing-page preview truthfully (no pipeline jargon). Mechanically sweep
every user-visible string added or edited in this EPIC.
**AC:** README describes the facing-page preview accurately and still lists
exact run/test commands verified against the actual scripts; the sweep finds
no `—`/`–`, no banned vocabulary, and no negative empty-state phrasing in any
shipped string (components + this spec's example copy in §4).

---

## 4. Copy (swept reference — ship these or better)
The preview is a mostly wordless, book-shaped surface (the screen is the
product). Its only product copy is the three states plus a quiet page-count
label. All strings below are already swept (no em-dashes, no banned
vocabulary, no negative empty-state openers):

- Laying-out (sr / visually-hidden label for the skeleton):
  **Laying out your book**
- Page-count label (book data, quiet): **{n} pages** (and **1 page** for one).
- Empty state (a file that produces zero pages):
  - heading: **This file has only front matter.**
  - body: **Open another book to see it laid out in facing pages.**
  - action: **Open another book**
- Error state:
  - heading: **Show the book again**
  - body: **The layout stopped before it finished. Open the book again to try.**
  - action: **Open another book**

Running heads and folios are book data (title, author, chapter, page number),
not product copy.

Sweep before done: reject the characters `—` and `–`, the words
`seamlessly / effortlessly / unlock / elevate / empower / leverage / robust /
dive in`, and negative openers (`You don't have`, `No … yet`, `Nothing …
here`, `Unable to`, `Something went wrong`) in every shipped string,
including anything added to `BookPreview.tsx` and the state surfaces.

---

## 5. Test plan (which automated test proves each criterion)

### 5.1 Unit / integration (Vitest + jsdom, co-located `*.test.ts`)
| Criterion | Test |
|---|---|
| Mirrored margins + folio edge by side | `pageGeometry.test.ts`: verso `textLeftPx` = outer px, recto = inner px; `columnPx` from `computeMetrics`; `folioEdge` mirrors; 528×816 leaf for `DEFAULT_DESIGN` |
| Running-head token resolution | `runningHead.test.ts`: `{title}/{author}/{chapter}` substituted; unknown token left literal; empty result renders no text |
| Verso/recto pairing + leading half-spread | `spreads.test.ts`: spread 0 = `[null, page0]`, then `[verso, recto]` pairs; single-mode identity list |
| Bounded windowing math | `bookScroller.test.ts`: correct `[firstSpread, lastSpread]`, overscan, `topPadPx`, `totalPx` across `scrollTop` values; window size independent of total spread count |
| Chrome + suppression + blank leaf | `BookPreview.test.tsx` / PageView test: header+folio on `body`; none on `opener`/`blank`; blank renders empty; soft hyphen shows `-` only when `hyphenated` |
| Bounded mounted nodes | `BookPreview.test.tsx`: a 300+ page `done` mounts a bounded number of page leaves at top / mid / end (drive the windowing) |
| State machine | `BookPreview.test.tsx` (fake engine): laying-out skeleton first; `progress` paints first spread; `done` shows full book; zero-page `done` shows empty state + action; `onError` shows product-voice error; dispose on unmount |
| Responsive re-group without re-paginate | `BookPreview.test.tsx`: toggling mode does not call `engine.paginate` again |
| a11y basics | region label present; sr-only page-count summary present; chrome suppressed on opener/blank |
| Copy swept | `BookPreview.test.tsx`: no `—`/`–`, no banned vocabulary, no negative empty-state openers in visible text |
| Existing suites intact | `App.test.tsx`, `states.test.tsx` still pass; ready state renders `StructureView` + `BookPreview` |

### 5.2 Browser harness (Playwright, Chromium)
| Criterion | Test |
|---|---|
| Bounded nodes while scrolling a 300+ page book | `e2e/preview.spec.ts`: import Middlemarch, assert mounted leaf count below a small bound at top, mid, and end after scrolling |
| Mirrored margins (printed test spread confirms alignment) | measure verso vs recto text-block left offset and assert the mirror; the `@media print` true-trim stylesheet lets a binder confirm the physical spread |
| Running headers + folios + suppression + recto openers | body page shows header/folio; opener/blank show neither; openers are recto |
| Usable at 390px | at 390px, no horizontal scroll (`scrollWidth <= clientWidth`), single-page mode active, body text readable |
| First spread within the first-feedback window | first leaf visible well under the engine settle time (streamed `firstPages` path) |
| EPIC 2 budgets/determinism unaffected | `e2e/pagination.spec.ts` still green (timings hook + `load`/`paginate` preserved) |

### 5.3 Recorded verification (part of DONE)
Record in `result.json` `summary`: the observed mounted-leaf bound while
scrolling the 300+ page book, confirmation of no horizontal scroll at 390px,
and that `e2e/pagination.spec.ts` still passes.

---

## 6. Data model / migrations
No database, no persistence, no on-disk format. This EPIC adds only
in-memory, presentational types (`PagePlacement`, `Spread`, the windowing
result) and React components. The `Document`, `DesignSpec`, and
`PaginationResult` shapes are consumed read-only and are not changed, so there
are no migrations.

---

## 7. QUALITY BAR mapping (binding; budget from the start)
- **§1 Perceived speed:** the first spread paints from the engine's streamed
  `firstPages` inside the 100ms window; virtualization keeps scroll and any
  result-swap O(visible spreads), so the surface never janks as page count
  grows and EPIC 2's ~2s settle budget is not regressed. This is also the
  differentiator (see the top of the spec).
- **§2 Mobile-first:** single readable page at 390px, no horizontal scroll,
  ≥44px interactive targets, spread only on wider viewports.
- **§3 Designed states:** layout-stable skeleton spread while laying out;
  product-voice error with a next step; a designed empty state for zero-page
  files. All tested.
- **§4 First-run:** the guided walkthrough is EPIC 7 and is out of scope here.
  This EPIC must not regress EPIC 1's first-run and in fact strengthens it:
  the sample now shows a real book-shaped preview, which is the north star's
  "see a book worth printing before touching a setting."
- **§5 Security hygiene:** no server, so authz/rate-limit are N/A by
  construction; no new network path; no file text in errors, logs, or hooks.
- **§6 Accessibility:** labeled, keyboard-scrollable region with visible
  focus; sr-only page-count summary; real text nodes for body and chrome;
  decorative elements `aria-hidden`; contrast from existing tokens;
  reduced-motion respected.
- **§7 Radically simple interface:** the book IS the screen. One primary
  surface, no controls, no chrome beyond headers/folios. Dials are EPIC 4;
  adding any here is drift.
- **§8 Copy that sounds human:** §4 reference copy is swept; sweep anything
  added before done. Header/folio are book data, exempt.
- **§9 README:** update the "Right now it…" paragraph and code-map to describe
  the facing-page preview truthfully; keep run/test commands accurate; no
  pipeline jargon.

Reconciliation: meeting the bar on the preview (virtualized bounded output,
designed states, 390px, a11y, swept copy) is in scope. Going past it
(typography dials, the slider, export, print-ready imposition, decorative
animation) is a later EPIC's work and would be drift here.

---

## 8. Definition of done
- All eight tasks' ACs met; every planner acceptance criterion (below) maps to
  a passing test or a recorded §5.3 measurement.
- `lint`, `typecheck`, `test` (Vitest) and both Playwright specs
  (`preview.spec.ts` new, `pagination.spec.ts` unchanged) are green.
- A 300+ page book scrolls with a bounded number of mounted page leaves; the
  renderer is O(visible spreads) on mount, scroll, and result-swap.
- Margins mirror correctly (inner margin on the gutter side), verified by the
  geometry test and the rendered-offset e2e assertion; the `@media print`
  stylesheet prints a true-trim spread for a physical alignment check.
- Running headers and folios are correct with suppression on openers and
  blanks; chapters open recto.
- Usable at 390px: no horizontal scroll, ≥44px targets, readable text.
- Empty, loading, and error states are designed and tested; copy swept.
- The throwaway `EnginePreview` is deleted and replaced by `BookPreview`;
  EPIC 2's engine, client, and timings hook are unchanged.

### Planner AC → coverage
1. *A 300-page book scrolls smoothly with only visible spreads in the DOM
   (bounded node count while scrolling)* → T3, T7; §5.1 bounded-nodes row;
   §5.2 row 1; §5.3.
2. *Margins mirror correctly (inner margin on the gutter side); a printed
   test spread confirms alignment* → T1, T2, T5 (print CSS), T7; §5.1
   geometry row; §5.2 row 2.
3. *Running headers and folios are correct, including suppression on
   chapter-opening and blank pages; chapters open recto* → T1, T2, T7; §5.1
   token + chrome rows; §5.2 row 3.
4. *Fully usable at 390px: no horizontal scroll, ~44px targets, text readable
   without zoom* → T3, T6, T7; §5.2 row 4.
5. *Empty state names the screen's purpose and first action; loading holds
   layout; error speaks in the product voice with a next step* → T4; §5.1
   state-machine + copy rows.
