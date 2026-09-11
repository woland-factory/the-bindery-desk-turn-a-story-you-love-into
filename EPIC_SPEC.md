# EPIC SPEC — Pagination engine (the risk concentrate)

> EPIC 2 of The Bindery Desk. This is the depth-first investment the whole
> product is built around: measurement-based pagination of a whole book,
> computed in a Web Worker, off the main thread, with progressive feedback.
> It consumes the parsed `Document` model from EPIC 1 (read-only) and
> produces a page-by-page layout plus an exact page count. It ships a
> deliberately minimal, throwaway preview only to prove the engine works
> end to end. Polished facing-page rendering is EPIC 3, dials are EPIC 4,
> the budget solver is EPIC 5, and imposition/export is EPIC 6. None of
> those are in this EPIC.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control, above all
the paper-budget slider, must re-flow the entire book with perceptible
feedback under 100ms and settle within about two seconds on a 300k-word
novel. Not more dials than InDesign. Faster, live feedback than anything
free (Word, Calibre, Reedsy).

**What it demands of THIS EPIC:** this EPIC *is* the responsiveness
engine. Every later re-flow (dials in EPIC 4, the slider in EPIC 5) calls
straight into what is built here, so the differentiator lives or dies on
this code. The two budgets below are not "nice to have" performance
targets, they are the acceptance criteria and the kill condition:

- First feedback (an estimated page count and the first real pages) within
  **100ms** of a pagination request.
- A settled, exact full-book result within **about 2 seconds** on a
  300k-word book.

The architecture is chosen to make later re-flows instant: the worker
holds the parsed `Document` in memory and re-paginates from a changed
`DesignSpec` alone, so a slider drag never re-transfers or re-parses the
book. If the engine cannot hit the budgets on the named 300k-word file,
this EPIC fails. It is never degraded around (downsampling, faking a page
count, skipping content). See §8 kill condition.

---

## 1. Scope

### In scope
1. **A pure, deterministic pagination core** that turns a `Document` plus a
   `DesignSpec` into a `PaginationResult` (pages, per-page line geometry,
   exact page count). Text measurement is injected through a `Measurer`
   interface so the core is testable without a browser.
2. **Measurement-based line breaking.** Greedy (first-fit) line breaking
   using real text-advance widths, with Knuth-Liang hyphenation to break a
   word that overflows the column.
3. **Widow and orphan control** at page boundaries and at chapter
   boundaries, toggleable, and guaranteed to terminate.
4. **Chapter-opening and blank-page rules** that change the page count:
   each chapter starts a new page, and (when the design asks for it) a
   chapter opens on a recto, inserting a blank verso where needed.
5. **A Web Worker** that runs the whole pass off the main thread, with a
   streaming protocol: an early first-feedback message, incremental
   progress, and a final settled result. Requests are cancelable
   (latest-wins) so a rapid series of re-flows does not queue up.
6. **A main-thread client** that owns the worker, sends `load` once per
   book and `paginate` per design, and surfaces streamed results and
   timings.
7. **A minimal, explicitly throwaway preview surface** that renders the
   engine output (page count, timing readout, the first few pages as plain
   laid-out lines) purely to validate the engine end to end. It has a
   loading and an error state and works at 390px, and it is replaced whole
   by EPIC 3.
8. **Named large test files:** a real ~150k-word EPUB and a real
   ~300k-word EPUB committed with provenance, plus the perf harness that
   measures and records the budgets against them.

### Out of scope (Non-Goals — building any is a defect)
- **Polished or virtualized preview UI:** facing pages, mirrored-margin
  visuals, running-header rendering, folio rendering, header/folio
  suppression styling, smooth-scroll virtualization. EPIC 3. The throwaway
  preview in this EPIC is a validation surface, not the real preview.
- **User-facing dials / controls.** No trim/font/margin/spacing UI, no
  toggles surfaced to the user. EPIC 2 consumes a single fixed default
  `DesignSpec` (§2.7). Building any control panel is EPIC 4.
- **The budget solver ("Fit into N sheets").** EPIC 5. Do not build a
  solver, a slider, or any search over the design space here.
- **Imposition / signatures.** No fold-to-signature math, and the
  `signatures` field from the plan's `PaginationResult` sketch is
  intentionally omitted from this EPIC's output (§2.4). EPIC 6.
- **PDF or any export.** EPIC 6.
- **Flowing images into pages.** Images are already dropped from flow in
  the EPIC 1 model; the engine lays out `heading`, `paragraph`, and `note`
  blocks only.
- **Any change to the parsed `Document` shape** (`src/model/document.ts`).
  The engine reads it; it does not modify it.
- **Persistence, project files, house-style presets.** EPIC 7.
- **Any runtime LLM.** The product has no text-generation feature.

---

## 2. Technical design

### 2.1 Stack additions
- **Web Worker (ES module).** Vite's native worker support:
  `new Worker(new URL('./pagination.worker.ts', import.meta.url), { type: 'module' })`.
  No worker plugin or extra config beyond this.
- **Text measurement:** `OffscreenCanvas.getContext('2d').measureText`
  inside the worker. The `Range`/DOM measurement path named in the planner
  scope needs a live DOM and layout, which a worker does not have, so
  OffscreenCanvas is the in-worker choice. A documented fallback
  (§2.5) keeps the app working where `OffscreenCanvas` is absent.
- **Hyphenation:** `hyphen` / Knuth-Liang patterns via the `hypher`
  package with the `hyphenation.en-us` pattern set (both MIT, pure JS,
  deterministic, worker-safe). Language is selected from
  `Document.language`, falling back to en-us. This is the only new runtime
  dependency; do not add a typesetting or layout library.
- **tsconfig:** add `"WebWorker"` to `lib` in `tsconfig.app.json` (it
  currently lists `ES2021`, `DOM`, `DOM.Iterable` only) so worker globals
  and `OffscreenCanvas` type-check. Keep `strict` and the existing
  `verbatimModuleSyntax` rule (use `import type` for type-only imports).

Keep the dependency list this short. Adding a layout/typesetting framework,
a font-parsing library (that is EPIC 6's concern), or a state library is
drift.

### 2.2 File / module layout (new files; nothing in `src/epub` or `src/model` changes)
```
src/engine/
  types.ts              DesignSpec, TextStyle, PaginationResult, Page, Line, Timings
  defaultDesign.ts      the single fixed default DesignSpec for this EPIC (§2.7)
  units.ts              px basis constants + pt/in -> px helpers (deterministic)
  measurer.ts           Measurer interface + SyntheticMeasurer (deterministic, for tests)
  offscreenMeasurer.ts  OffscreenCanvas-backed Measurer (worker/browser only)
  hyphenate.ts          hypher wrapper, language-selected, pure + memoized
  lineBreak.ts          greedy line breaking + hyphenation over one paragraph (pure)
  paginate.ts           lines -> pages: chapter-open, recto/blank, widow/orphan, count (pure)
  engine.ts             streaming orchestration: (Document, DesignSpec, Measurer) -> events
  protocol.ts           worker message types: load | paginate | progress | done | error
  pagination.worker.ts  worker entry: holds Document, uses offscreenMeasurer, runs engine
  client.ts             main-thread client: owns Worker, load()/paginate(), streams events
  *.test.ts             unit tests (SyntheticMeasurer; jsdom-safe)
src/ui/
  EnginePreview.tsx      throwaway validation preview (bounded, loading + error, 390px)
  EnginePreview.test.tsx
test/fixtures/large/
  <~150k-word>.epub      real public-domain EPUB (§2.9)
  <~300k-word>.epub      real public-domain EPUB (§2.9)
  PROVENANCE.md          source URLs, license, measured word counts
e2e/pagination.spec.ts   Playwright: budgets, determinism, main-thread responsiveness
```

### 2.3 Inputs the engine consumes
- `Document` (read-only, from `src/model/document.ts`). The engine walks
  `chapters[].blocks[]`, laying out only blocks with
  `keptOrDropped === 'kept'` and `type` in `heading | paragraph | note`.
  Dropped blocks and `image` blocks are skipped (they carry no flowable
  text). Inline formatting is already flattened to `Block.text` by EPIC 1,
  so a block is a single plain string.
- `DesignSpec` (§2.7). All page geometry, font, spacing, margins, and the
  two toggles (`widowControl`, `hyphenation`) come from here.

### 2.4 Output: `PaginationResult`
Matches the plan's data-model sketch, minus `signatures` (imposition is
EPIC 6 and is a Non-Goal here). Keep it fully serializable (plain
objects/arrays/strings/numbers) so it clones cheaply across `postMessage`.

```ts
// src/engine/types.ts
export interface Line {
  text: string;        // the exact substring laid out on this line
  x: number;           // left offset within the text column, in px (0 at column start)
  y: number;           // baseline offset from the top of the text area, in px
  width: number;       // measured advance width of `text`, in px
  hyphenated: boolean; // true if this line ends in a soft hyphen inserted by the engine
}

export type PageKind = 'body' | 'opener' | 'blank';
export type PageSide = 'recto' | 'verso';

export interface Page {
  index: number;         // 0-based sequential page number
  side: PageSide;        // recto = odd 1-based folio, verso = even
  kind: PageKind;        // opener = a chapter starts here; blank = inserted spacer
  chapterIndex: number;  // Chapter.order this page belongs to (-1 for a blank spacer)
  lines: Line[];         // empty for a blank page; opener pages may reserve top space
}

export interface Timings {
  wordCount: number;
  pageCount: number;
  firstFeedbackMs: number; // request dispatch -> first `progress` message on main
  settleMs: number;        // request dispatch -> `done` message on main
}

export interface PaginationResult {
  pageCount: number;
  pages: Page[];
  // `signatures` is intentionally omitted: imposition is EPIC 6.
}
```

Geometry convention: `x`/`y`/`width` are relative to the **text area** of a
page (the rectangle inside the margins), in CSS px. The engine does **not**
mirror margins or place the text area on the physical page. That mapping
(inner vs outer margin, gutter side per recto/verso) is a pure rendering
concern and belongs to EPIC 3. The engine only needs the **column width**,
which is constant across pages for a given design (see §2.6), so mirroring
does not affect pagination or page count.

### 2.5 Measurement (the `Measurer` seam)
Line breaking depends on real advance widths, but jsdom has no text metrics
and no `OffscreenCanvas`, and we must be able to unit-test the algorithm
deterministically. So measurement is an injected interface.

```ts
// src/engine/measurer.ts
export interface TextStyle {
  family: string;   // CSS font-family list from the DesignSpec
  sizePx: number;   // font size in CSS px (derived from sizePt, see units.ts)
  // weight/style are fixed for body text in this EPIC; headings may use a
  // bold flag. Keep the surface this small.
  bold?: boolean;
}

export interface Measurer {
  /** Advance width of `text` at `style`, in CSS px. Must be a pure function
   *  of (text, style) for the lifetime of the measurer. */
  measure(text: string, style: TextStyle): number;
}
```

- **`OffscreenCanvasMeasurer` (production, worker):** wraps one
  `OffscreenCanvas(0,0).getContext('2d')`. Sets `ctx.font` from the
  `TextStyle` and returns `ctx.measureText(text).width`. It **memoizes**
  by `(style-key, text)` because a novel repeats most of its words; the
  cache is what keeps the 300k-word pass inside budget. Before the first
  measure the worker awaits `self.fonts.ready` (when `self.fonts` exists)
  so `measureText` uses the intended family rather than a mid-load
  fallback. Determinism holds because, within one environment, a given
  font string yields identical metrics on every run.
- **`SyntheticMeasurer` (tests):** a deterministic measurer with no
  platform dependency. Width is computed from a fixed per-character advance
  table (a default advance for unlisted characters), so tests can construct
  exact line-fill scenarios and assert precise break points, page counts,
  and widow/orphan behavior. This runs in jsdom.
- **Fallback:** if `OffscreenCanvas` is unavailable in the worker, fall
  back to an approximate average-advance measurer (a per-character width
  table for the default family) so the app still paginates and never
  crashes. This path is less accurate and must be logged once; the primary,
  budget-bearing path is `OffscreenCanvasMeasurer` (the Playwright target,
  Chromium, has `OffscreenCanvas`).

`units.ts` fixes the px basis so every derivation is deterministic
arithmetic: **96 px per inch, `96/72` px per point.** `sizePx = sizePt * 96/72`.
Line advance (leading) `lineHeightPx = lineHeightPt * 96/72`. Column and
text-area dimensions convert from the design's units the same way.

### 2.6 Line breaking, hyphenation, page assembly
**Column width** (constant per design):
`columnPx = (trim.w - margins.inner - margins.outer)` converted to px.
**Text-area height:** `(trim.h - margins.top - margins.bottom)` in px.
**Lines per page:** `floor(textAreaPx / lineHeightPx)` (integer; the same
on every non-opener body page). An opener page reserves a fixed top drop
(from `chapterOpening`) and therefore holds fewer lines; compute its
capacity the same way from the reduced text area.

**Greedy line breaking (`lineBreak.ts`, pure, measurer-injected):** for one
paragraph, accumulate words separated by single spaces; when the next word
would exceed `columnPx`, end the line before it. If a single word alone
exceeds `columnPx`, or `hyphenation` is on and a hyphenated prefix would
better fill the line, split the word at a Knuth-Liang hyphenation point
(`hyphenate.ts`), append a soft hyphen to the prefix, and carry the
remainder. A word with no valid hyphenation point that still overflows is
placed on its own line (it may exceed the column; never drop text, never
loop). Whitespace is normalized to single spaces (EPIC 1 already
normalized runs). `heading` and `note` blocks break the same way; a
heading may use `bold: true` and its own size from the design.

**Page assembly (`paginate.ts`, pure):** walk chapters in `order`. For each
chapter: start a new page (an `opener`), honoring the recto rule below;
emit the chapter's heading block(s), then lay each paragraph's lines onto
pages, filling to the per-page line capacity, opening a new `body` page
when full. Assign each `Line` its `x` (0 for left-aligned), `y`
(`lineIndexOnPage * lineHeightPx`, plus opener top drop), and `width`.
`pageCount` is the number of pages emitted, including inserted blanks.

**Chapter-opening and blank-page rules (affect page count, so they live
here):**
- Every chapter begins on a fresh page (`kind: 'opener'`).
- When `chapterOpening.startRecto` is true, an opener must land on a recto
  (odd 1-based folio). If the next page would be a verso, insert one
  `kind: 'blank'` page first. `side` is derived from 0-based `index`
  (`index` even -> recto folio 1,3,5...; i.e. `side = index % 2 === 0 ? 'recto' : 'verso'`;
  fix the mapping once in code and keep it consistent).
- Blank pages carry no lines and `chapterIndex = -1`.

### 2.7 The fixed default `DesignSpec` (no UI in this EPIC)
The engine needs geometry to run; EPIC 4 builds the controls that mutate
it. This EPIC ships one hardcoded default and no way to edit it. Concrete
values (half-letter trim, a common home-bind size), so the build is
executable without a decision:

```ts
// src/engine/types.ts
export interface DesignSpec {
  trim: { w: number; h: number; unit: 'in' | 'mm' };
  font: { family: string; sizePt: number; lineHeightPt: number; bold?: boolean };
  margins: { inner: number; outer: number; top: number; bottom: number }; // trim units
  chapterOpening: { topDropPt: number; startRecto: boolean };
  runningHeader: { verso: string; recto: string; showOnOpener: boolean }; // stored, not rendered here
  widowControl: boolean;
  hyphenation: boolean;
}

// src/engine/defaultDesign.ts
export const DEFAULT_DESIGN: DesignSpec = {
  trim: { w: 5.5, h: 8.5, unit: 'in' },
  font: { family: 'Georgia, "Times New Roman", serif', sizePt: 11, lineHeightPt: 15 },
  margins: { inner: 0.75, outer: 0.5, top: 0.6, bottom: 0.7 },
  chapterOpening: { topDropPt: 72, startRecto: true },
  runningHeader: { verso: '{author}', recto: '{title}', showOnOpener: false },
  widowControl: true,
  hyphenation: true,
};
```

`runningHeader` is carried in the type (the model sketch names it) but is
**not** rendered in this EPIC; EPIC 3 owns headers. The engine ignores it.
The family is a common system serif with a generic fallback; EPIC 4/6 own
the curated, embeddable font choices, so do not commit a font file or make
any licensing decision here.

### 2.8 Widow/orphan control (`widowControl`)
Definitions used: an **orphan** is the first line of a paragraph left alone
at the foot of a page; a **widow** is the last line of a paragraph left
alone at the top of the next page. With `widowControl: true`, keep at least
**two** lines of a paragraph together at every page break:
- **Orphan:** if only one line of a starting paragraph would fit at the
  foot of the current page, move the whole paragraph to the next page
  (leave the foot short).
- **Widow:** if a break would leave exactly one line to carry to the next
  page, pull one earlier line down so at least two lines carry over.
- **Chapter boundary:** apply the same two-line minimum to the chapter's
  opening paragraph so a lone opening line is never stranded at the foot of
  an opener, and a chapter's final paragraph never leaves a lone widow.

Termination and determinism are mandatory: the adjustment must be bounded
(a paragraph is moved forward at most once per page it is considered on;
never re-enter a page it already left). If a paragraph is shorter than the
two-line minimum, or the page can hold fewer than two lines, take the
plain greedy break rather than looping. With `widowControl: false` the
engine takes the plain greedy break everywhere. The toggle must produce an
observably different page layout on the test files (proving it is wired),
and both settings must be deterministic.

### 2.9 Streaming protocol, worker, and client
**Message protocol (`protocol.ts`):**
- main -> worker `{ type: 'load', requestId, document }` — sent once per
  book. The worker keeps the `Document` in memory for subsequent
  `paginate` calls, so a re-flow never re-transfers the book. `document`
  crosses by structured clone.
- main -> worker `{ type: 'paginate', requestId, design }` — the hot path.
  Runs against the held `Document`. Repeatable and cheap to send.
- worker -> main `{ type: 'progress', requestId, estimatedPageCount, firstPages }`
  — the **first-feedback** message, emitted within 100ms: a cheap page-count
  estimate (from total character count over an estimated chars-per-page)
  plus the first fully paginated pages (enough to fill the throwaway
  preview). Further `progress` messages may refine `estimatedPageCount` and
  extend `firstPages` as the pass proceeds.
- worker -> main `{ type: 'done', requestId, result, timings }` — the
  settled exact `PaginationResult` and `Timings`.
- worker -> main `{ type: 'error', requestId, message }` — a product-voice,
  file-free message on failure. Never post file text in an error.

**Cancellation (latest-wins):** each `paginate` carries a monotonically
increasing `requestId`. The worker checks the current `requestId` between
work slices and abandons a pass whose id is stale, so a burst of re-flows
(EPIC 5's slider) collapses to the latest. The client ignores `progress`
and `done` for superseded ids. The engine yields between slices (e.g.
after each chapter, or every N pages) so cancellation is prompt and the
first-feedback message can be posted before the full pass finishes.

**Client (`client.ts`):** owns one worker for the app's lifetime, exposes
`load(document)` and `paginate(design)` returning a subscription of
streamed events, stamps `firstFeedbackMs` and `settleMs` from the dispatch
time of each `paginate` to the first `progress` / the `done`, and exposes
the latest `Timings` for the preview and the perf test to read (e.g. a
`window.__BINDERY_ENGINE_TIMINGS__` hook plus a DOM readout in the
preview). Timing is measured from `paginate` dispatch, so it isolates the
engine from EPIC 1 parse time.

### 2.10 Determinism
Identical `Document` + identical `DesignSpec` + identical `Measurer` must
produce a byte-identical `PaginationResult`, including an identical
`pageCount`, on every run. Requirements:
- No `Math.random`, no `Date.now`, no wall-clock or environment input in
  the core (timings are metadata attached at the edge, never fed back into
  layout).
- Deterministic iteration only (arrays and insertion-ordered maps; no
  iteration over unordered structures).
- Hyphenation (Knuth-Liang) is deterministic; the hyphenation cache must
  not change results, only speed.
- Greedy fit comparisons must not flip on float noise. Within one
  environment `measureText` is stable across runs, which satisfies the
  same-environment determinism AC directly. To reduce cross-environment
  drift and keep golden tests stable, round measured advances to a fixed
  precision before comparison (a single rounding helper in `units.ts`).

### 2.11 Named large test files (§2.2 `test/fixtures/large/`)
The planner requires a **real** 150k-word and a **real** 300k-word EPUB
("real" meaning genuine prose, not repeated filler that would game the
measurement cache and misrepresent perf). No such files exist in the repo
yet. Commit two real, redistributable, public-domain EPUBs from Standard
Ebooks (clean EPUB3, US public domain):
- **~150k-word class:** *Emma* by Jane Austen (about 160k words) is the
  concrete default.
- **~300k-word class:** *Middlemarch* by George Eliot (about 316k words) is
  the concrete default. The ~2s settle budget binds on this file.

If a chosen title's measured word count differs, the implementer records
the **actual** counts in `PROVENANCE.md` and in `result.json`; the ~150k
file must be at least ~150k words and the ~300k (budget-bearing) file at
least ~300k words. `PROVENANCE.md` records source URLs, license, and
measured word counts. Do not fetch these over the network at test time
(that breaks offline/deterministic tests and the privacy ethos); commit
the bytes, mirroring the existing bundled-sample pattern
(`scripts/makeSample.mjs`, `public/sample/aesops-fables.epub`). These
fixtures are test assets under `test/fixtures/large/`; do not ship them in
the app bundle.

---

## 3. Ordered task list (each maps to acceptance criteria)

### T1 — Engine types, units, default design, protocol
Create `src/engine/types.ts`, `units.ts`, `defaultDesign.ts`, `protocol.ts`.
Add `"WebWorker"` to `tsconfig.app.json` `lib`.
**AC:** `npm run typecheck` and `npm run lint` pass. `units.ts` converts pt
and in to px on the fixed 96 px/in basis; a unit test pins the conversions
and the rounding helper. `DEFAULT_DESIGN` matches §2.7.

### T2 — Measurer seam
Implement `Measurer`, `SyntheticMeasurer`, and `OffscreenCanvasMeasurer`
(with memoization and the `self.fonts.ready` await), plus the average-advance
fallback.
**AC:** `SyntheticMeasurer` is a pure deterministic function of
(text, style), unit-tested. `OffscreenCanvasMeasurer` is covered by the
Playwright run (jsdom cannot exercise it). The fallback is selected only
when `OffscreenCanvas` is absent and logs once.

### T3 — Line breaking + hyphenation
Implement `hyphenate.ts` (hypher, language-selected, memoized) and
`lineBreak.ts` (greedy, measurer-injected).
**AC (SyntheticMeasurer):** words pack greedily to a set column width with
correct break points; a word longer than the column hyphenates at a valid
point with a soft hyphen on the prefix and the remainder carried; a word
with no valid break sits on its own line without dropping text or looping;
turning `hyphenation` off changes the breaks. No text is ever lost or
duplicated across lines (a reassembly test proves line concatenation equals
the source paragraph, ignoring inserted soft hyphens and normalized
spaces).

### T4 — Page assembly + chapter/recto/blank rules
Implement `paginate.ts`: lines to pages, per-page line capacity, opener top
drop, recto-opening with blank-verso insertion, `pageCount`, and correct
`Page` metadata (`index`, `side`, `kind`, `chapterIndex`).
**AC (SyntheticMeasurer):** on a crafted multi-chapter document, page count
and per-page line counts match hand-computed expectations; each chapter
begins on an `opener`; with `startRecto` true every opener has
`side === 'recto'` and a blank verso is inserted exactly where a chapter
would otherwise open on a verso; blanks carry no lines and
`chapterIndex === -1`.

### T5 — Widow/orphan control
Implement §2.8 in `paginate.ts` (or a `widowOrphan.ts` it calls). Bounded,
terminating, toggleable.
**AC (SyntheticMeasurer):** on crafted paragraphs positioned to strand a
line, with `widowControl` on no page ends with a lone orphan first line and
no page begins with a lone widow last line, at both page and chapter
boundaries; with it off the stranded line reappears (proving the control is
what prevents it). A pathological case (a two-line paragraph against a
one-line remainder, repeated) terminates and is deterministic.

### T6 — Streaming engine + worker + client
Implement `engine.ts` (slice-yielding pass emitting estimate, first pages,
progress, done), `pagination.worker.ts` (holds the `Document`, uses
`OffscreenCanvasMeasurer`, handles `load`/`paginate`, honors latest-wins
cancellation), and `client.ts` (owns the worker, `load`/`paginate`,
timing stamps, timings hook).
**AC:** the worker paginates the held `Document` from a `design` message
without re-sending the book. A new `paginate` supersedes an in-flight one
(stale-id results are dropped). The client reports `firstFeedbackMs` and
`settleMs` measured from dispatch. Proven in the Playwright run (T10);
`engine.ts` slice/estimate logic is additionally unit-tested against a fake
transport with the `SyntheticMeasurer`.

### T7 — Determinism guarantees
Ensure the core has no nondeterministic inputs and assembles results in a
stable order.
**AC:** running `paginate` twice on the same `Document` + `DesignSpec` +
`SyntheticMeasurer` deep-equals (identical `pageCount` and identical
`pages`). A second determinism check in the browser (T10) confirms an
identical page count across two runs on a large real file.

### T8 — Throwaway validation preview + app wiring
Implement `EnginePreview.tsx` and wire it into `App.tsx`: after a
successful parse, `load` the `Document` and `paginate` with
`DEFAULT_DESIGN`, show a layout-stable "laying out" state, then render page
count, the timing readout, and the first few pages as plainly laid-out
lines. Bounded output (render only the first spread or few pages, never the
whole book). Loading and error states in product voice; usable at 390px
with no horizontal scroll; copy swept (§4). Explicitly provisional; EPIC 3
replaces it.
**AC:** loading the bundled sample (or a dropped EPUB) shows the page count
and first laid-out pages without a blank screen; the DOM node count stays
bounded regardless of book size; a forced engine error renders the designed
error state, not a crash; the surface is usable at 390px. Existing EPIC 1
tests still pass (the `empty | loading | ready | error` machine is extended,
not broken).

### T9 — Large real EPUB fixtures + provenance
Commit the two real public-domain EPUBs under `test/fixtures/large/` and
`PROVENANCE.md` (§2.11) with measured word counts.
**AC:** both files parse through the existing `parseEpub` into ordered
chapters; measured word counts are recorded and meet the ~150k / ~300k
thresholds; `PROVENANCE.md` states source and license; the files are not
included in the app bundle.

### T10 — Perf + responsiveness + determinism harness (Playwright)
`e2e/pagination.spec.ts`: load the app, import each large fixture via the
file input, run the engine, read the exposed timings, and assert the
budgets. Measure main-thread long tasks during the pass. Assert identical
page count across two runs on the 300k file. Record the numbers.
**AC:** on the ~300k file, `firstFeedbackMs <= 100` and
`settleMs <= ~2000` (budget; see §8 kill condition); during the pass no
main-thread long task exceeds the threshold (worker keeps the main thread
responsive); two runs yield an identical page count. Numbers are recorded
in `result.json` (and optionally a short report artifact).

---

## 4. Copy (throwaway preview only; swept)
The validation preview is minimal, but its visible strings still meet the
bar (positive, plain, no em-dashes, no banned vocabulary, no negative
empty-state phrasing). Reference copy, already swept, ship it or better:
- Laying-out state: **Laying out your book**
- Page-count readout (estimate, then exact): **About {n} pages** then
  **{n} pages**
- Preview error heading: **Run the layout again**
- Preview error body: **The layout stopped before it finished. Reload the
  book to try again.**
- Timing readout label (validation detail): **First view {a} ms, settled
  {b} ms**

Sweep note before done: reject the characters "—" and "–", the words
"seamlessly / effortlessly / unlock / elevate / empower / leverage / robust
/ dive in", and negative openers ("You don't have", "No … yet", "Nothing
here", "Unable to", "Something went wrong") in every shipped string,
including anything added to `EnginePreview.tsx` and the error path.

---

## 5. Test plan (which automated test proves each criterion)

### 5.1 Unit / integration (Vitest + jsdom, `SyntheticMeasurer`, co-located `*.test.ts`)
| Criterion | Test |
|---|---|
| Units + rounding deterministic | `units.test.ts` pins pt/in -> px and the rounding helper |
| Greedy breaking + hyphenation, no text loss | `lineBreak.test.ts`: exact break points at a set column; hyphenate an over-long word; unbreakable word on its own line; toggle changes breaks; reassembled lines equal source |
| Page assembly + chapter/recto/blank rules | `paginate.test.ts`: page count and per-page line counts match hand-computed; openers per chapter; recto rule inserts a blank verso exactly where needed; blank metadata correct |
| Widow/orphan prevents stranded lines | `paginate.test.ts` (or `widowOrphan.test.ts`): no lone orphan/widow at page and chapter boundaries with control on; stranded line reappears with control off; pathological case terminates deterministically |
| Determinism | run `paginate` twice, deep-equal result incl. `pageCount` |
| Streaming/estimate/cancellation logic | `engine.test.ts` against a fake transport: first-feedback message carries an estimate and first pages; a superseded `requestId` is abandoned |
| Preview states | `EnginePreview.test.tsx`: laying-out, populated, and error states render designed content; DOM output bounded; copy swept |
| App wiring intact | existing `App.test.tsx` and state tests still pass; parse -> load -> paginate path reaches the preview |

### 5.2 Browser harness (Playwright, `e2e/pagination.spec.ts`, Chromium)
| Criterion | Test |
|---|---|
| First feedback ≤ 100ms; 300k settles ≤ ~2s; measured/recorded | run the engine on the ~300k fixture; read exposed `Timings`; assert budgets; record numbers |
| Runs in a Web Worker; main thread responsive | assert the worker exists and does the work; observe main-thread long tasks during the pass and assert none exceed the threshold |
| Deterministic page count across runs | paginate the 300k fixture twice in-browser; assert identical `pageCount` |
| Real 150k + 300k files paginate end to end | both fixtures import and produce a full `PaginationResult` with a plausible page count |

### 5.3 Recorded verification (part of DONE)
Record in `result.json` `summary` (and optionally a short report artifact):
measured `firstFeedbackMs` and `settleMs` for the 150k and 300k files, the
measured word counts of both fixtures, the resulting page counts, and the
observed max main-thread long-task duration during a pass.

---

## 6. Data model / migrations
No database, no on-disk format, no persistence. All new types
(`DesignSpec`, `PaginationResult`, `Page`, `Line`, `TextStyle`, `Timings`,
the protocol messages) are in-memory only, so there are no migrations. The
existing `Document`/`ImportReport` shapes in `src/model/` are consumed
read-only and are not changed.

---

## 7. QUALITY BAR mapping (binding; budget from the start)
- **§1 Perceived speed:** this is the EPIC. First feedback ≤ 100ms, settle
  ≤ ~2s on 300k, both measured. The preview renders bounded output (first
  pages only), never the whole book eagerly, so it does not jank as page
  count grows.
- **§2 Mobile-first:** the throwaway preview is usable at 390px, single
  column, no horizontal scroll. (Facing pages are EPIC 3.)
- **§3 Designed states:** the preview has a layout-stable "laying out"
  state and a product-voice error state, both tested.
- **§4 First-run:** out of scope here (the drop-to-export walkthrough is
  EPIC 7). The preview must not regress EPIC 1's first-run: the sample
  still loads and now also shows a real page count and first laid-out
  pages, which strengthens "understand what the product does."
- **§5 Security hygiene:** no server, so authz/rate-limit are N/A by
  construction. The engine runs on already-parsed, in-browser data; no
  network path is added. No file text is placed in worker errors, timing
  hooks, or logs (privacy / no-PII).
- **§6 Accessibility:** the preview uses semantic structure, labeled
  controls if any, and visible focus. No images are rendered.
- **§7 Radically simple interface:** the preview is a bare validation
  surface, not a second product screen. Do not add controls or chrome;
  EPIC 3/4 own the real UI.
- **§8 Copy that sounds human:** §4 reference copy is swept; sweep anything
  added before done.
- **§9 README:** no change required by this EPIC beyond keeping it accurate;
  if the run surfaces user-facing behavior, keep the README truthful. Do
  not add pipeline jargon.

Reconciliation: meeting the bar on the throwaway preview (bounded output,
loading/error states, 390px, swept copy) is in scope. Polishing it beyond
that (facing pages, virtualization, headers, animations) is EPIC 3's work
and would be drift here.

---

## 8. Definition of done
- All ten tasks' ACs met; every planner acceptance criterion below maps to
  a passing test or a recorded §5.3 measurement.
- `lint`, `typecheck`, `test` (Vitest) and the Playwright harness are green.
- The engine runs in a Web Worker; the main thread stays responsive during
  a full pass (measured).
- Results are deterministic (identical input + design -> identical page
  count and pages).
- Widow/orphan control demonstrably prevents stranded lines at page and
  chapter boundaries on the test files, and is toggleable.
- Copy swept; preview states designed and tested; 390px verified.
- Measured `firstFeedbackMs`, `settleMs`, word counts, and page counts are
  recorded in `result.json`.

**Kill condition (from the validation, binding):** if first feedback
exceeds 100ms, or the settle time exceeds ~2s on the ~300k-word file, this
EPIC is **failed**, not degraded. Do not fake the budget by downsampling,
capping content, estimating instead of paginating, or skipping widow/orphan
work. If the budget cannot be met, set `outcome: "failure"` and report the
measured numbers so the owner sees the real signal.

### Planner AC → coverage
1. *Paginates real 150k + 300k EPUBs (named files); first page-count and
   preview feedback ≤ 100ms; 300k settles ≤ ~2s, measured and recorded* →
   T6, T8, T9, T10; §5.2 rows 1 and 4; §5.3.
2. *Runs in a Web Worker; main thread stays responsive, no long-task jank*
   → T6; §5.2 row 2.
3. *Deterministic: identical input and settings -> identical page count
   across runs* → T7; §5.1 determinism row; §5.2 row 3.
4. *Widow/orphan control demonstrably prevents single stranded lines at
   page and chapter boundaries on the test files* → T5; §5.1 widow/orphan
   row.
5. *Failing the 100ms or ~2s budget on the 300k file fails the EPIC (kill
   condition), not degraded* → §8 kill condition; T10 asserts the budgets
   and the run reports failure rather than degrading if unmet.
