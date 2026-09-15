# EPIC SPEC — Typography dials

> EPIC 4 of The Bindery Desk. EPIC 3 put a real book on screen for one fixed
> design (`DEFAULT_DESIGN`). This EPIC gives the binder the dials their Word
> template encodes and re-flows the whole book live as they turn them: page
> size, font, font size, line spacing, margins, chapter opening, running-header
> content, widow/orphan control, and hyphenation. It adds a radically simple
> control panel beside the existing facing-page preview, wires each engine-
> affecting change through the pagination worker (which already holds the book
> and re-paginates from a design alone), and persists the working design so a
> reload restores the binder's dials.
>
> This EPIC adds NO paper-budget slider (EPIC 5), NO export or imposition
> (EPIC 6), NO project files / named house-style presets / guided walkthrough
> (EPIC 7), and NO fonts beyond the curated set. It does not edit the story
> text or re-parse the file.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control re-flows the
entire book with perceptible feedback under 100ms and a settled result within
about two seconds on a 300k-word novel. We do not out-feature InDesign. We make
control immediate and reversible in a way no free path (Word, Calibre, Reedsy)
offers.

**What it demands of THIS EPIC:** the dials ARE the differentiator's proving
ground. Every engine-affecting change must ride the exact hot path EPIC 2 built
and EPIC 3 rendered against, so the budgets hold under a stream of user input:

- **Instant control feedback.** Turning a dial updates the control itself in
  the same frame (optimistic, native input state), so the user always feels the
  change under 100ms even before pages re-flow.
- **Reuse the warm worker.** The worker holds the parsed `Document` (`load` is
  sent once). A dial change sends only `paginate(design)`, never re-transfers or
  re-parses the book. The worker's latest-wins cancellation (`isStale`) already
  supersedes stale requests, so dragging a numeric control never queues a
  backlog.
- **Never blank on re-flow.** The last good result stays mounted (rendered with
  its own matched design) while the new pass runs; the streamed `firstPages`
  repaint the top of the book inside the 100ms window; the full result swaps in
  on `done`. No dial change may drop the surface to the skeleton or reset scroll.
- **Render-only changes skip the engine.** Running-header content changes only
  what the renderer draws, not pagination geometry, so they apply in the same
  frame with no `paginate` call at all.
- **The default path stays untouched.** A fresh session's initial pagination is
  still `DEFAULT_DESIGN` with the system serif stack, with zero added
  synchronous or async work before the first `paginate`. EPIC 2's budget,
  determinism, and long-task e2e specs must pass unchanged.

---

## 1. Scope

### In scope
1. **A control panel of typography dials**, each mapped to a field of
   `DesignSpec` (`src/engine/types.ts`), controlled by the active design and an
   `onChange`:
   - **Page size (trim).** A curated preset list plus a "Custom size" mode with
     width, height, and unit (`in`/`mm`) inputs. Presets set `trim` whole.
   - **Font.** A small curated set of embeddable, licensed faces, plus the
     system serif default. Sets `font.family`.
   - **Font size.** `font.sizePt`, a bounded numeric stepper.
   - **Line spacing.** A multiplier of font size that derives `font.lineHeightPt`.
   - **Margins.** Inner, outer, top, bottom, in the trim's unit. Sets `margins`.
   - **Chapter opening.** The opener top-drop (`chapterOpening.topDropPt`) as a
     small named set, and a "start chapters on the right" toggle
     (`chapterOpening.startRecto`).
   - **Running-header content.** Left-page and right-page pickers over the
     book-data tokens. Sets `runningHeader.verso` / `runningHeader.recto`.
   - **Widow and orphan control.** `widowControl` toggle.
   - **Hyphenation.** `hyphenation` toggle.
2. **Live re-flow wiring.** Every engine-affecting dial re-paginates through the
   existing `EngineClient` against the warm worker; the preview swaps to the new
   result without blanking or losing scroll position. Running-header changes
   re-render only.
3. **Correct trim re-mirroring.** Changing the page size (or any margin) re-
   derives the mirrored placement so a verso still carries the outer margin on
   its left and a recto the inner margin, and the text column re-widths to
   `trim.w - inner - outer`. This is `pageGeometry.pagePlacement` already; the
   EPIC guarantees the preview reflects it after every trim change.
4. **Curated embeddable fonts, measured accurately.** Each curated face is
   bundled as a woff2 (regular + bold), declared with `@font-face` for on-screen
   rendering, and **loaded into the worker's `FontFaceSet` before it measures**,
   so line breaking uses the real face's metrics (what you see is what settles).
   The default system serif requires no load. Embeddability is proven end to end
   in EPIC 6; this EPIC bundles the licensed files and proves they render and
   drive pagination.
5. **Session persistence of the working design.** The current `DesignSpec` is
   saved to `localStorage` and restored on reload in the same browser, merged
   forward-compatibly onto `DEFAULT_DESIGN`. Design only. No file content, no
   PII, no project files, no named presets.
6. **Radically simple, mobile-first, accessible panel.** One visually primary
   action slot (Export, reserved and disabled here since export is EPIC 6),
   visibly subordinate dials, usable at a 390px viewport with ~44px targets,
   every input labeled, full keyboard reach with visible focus.
7. **A "reset to defaults" action** so a binder can return to `DEFAULT_DESIGN`
   in one tap (a real, in-scope secondary action).

### Out of scope (Non-Goals — building any is a defect)
- **The paper-budget solver and "Fit into N sheets" slider (EPIC 5).** No solver
  that searches the design space, no sheet/signature readout, no slider.
- **Export, PDF generation, imposition, or signatures (EPIC 6).** The Export
  button is a reserved, disabled primary slot only. Do not generate any file.
- **Project files, named house-style presets, import/export of settings, or the
  guided first-run walkthrough (EPIC 7).** Session persistence of the single
  working design is in scope; everything else in EPIC 7 is not.
- **Adding fonts beyond the curated set**, a font-upload surface, or a font
  marketplace.
- **InDesign-grade microtypography:** kerning-pair editing, drop-cap galleries,
  ornaments, tracking, optical margins. The dials are exactly the nine listed
  above.
- **Editing the story text**, re-parsing, or any change to the `Document` model
  or the EPUB parser.
- **Changing `DEFAULT_DESIGN`.** The shipped default stays the system serif
  half-letter design so EPIC 2's golden page counts and budgets are preserved.
  The curated embeddable faces are user choices, not the default.
- **Any runtime LLM.** The product has no text-generation feature.

---

## 2. Technical design

### 2.1 What already exists (consume; change only where §2.6/§2.7 name it)
- `src/engine/types.ts` — `DesignSpec` (all nine dials map here), `Page`,
  `PaginationResult`. **Unchanged.** Every dial writes an existing field; no new
  `DesignSpec` field is added.
- `src/engine/defaultDesign.ts` — `DEFAULT_DESIGN`. **Unchanged.** It is both the
  shipped default and the "reset" target.
- `src/engine/paginate.ts` — `computeMetrics(design)` (derives `columnPx`,
  `lineHeightPx`, per-page line capacities from the design). Re-runs per design;
  no change needed.
- `src/engine/client.ts` — `EngineClient` / `EngineClientLike`: `load(doc)`,
  `paginate(design, handlers)`, `dispose()`, latest-wins, publishes
  `__BINDERY_ENGINE_TIMINGS__` on `done`. This EPIC **adds one method**
  (`warmFonts`, §2.6) and keeps everything else intact.
- `src/engine/protocol.ts` — worker messages. This EPIC **adds one message**
  (`warm-fonts`, §2.6).
- `src/engine/pagination.worker.ts` — holds the document, re-paginates per
  `paginate`. This EPIC **adds a font-load step** before measuring a curated
  face and a `warm-fonts` handler (§2.6).
- `src/ui/BookPreview.tsx` — the virtualized facing-page surface. Today it owns
  the engine and paginates `DEFAULT_DESIGN` once. This EPIC **lifts the design
  in as a prop**, keeps the engine alive across design changes, and re-paginates
  on change without blanking (§2.7).
- `src/ui/pageGeometry.ts`, `src/ui/PageView.tsx`, `src/ui/Spread.tsx`,
  `src/ui/spreads.ts`, `src/ui/bookScroller.ts`, `src/ui/runningHead.ts` — all
  already read `design` from props and are pure over it. **Unchanged**; they
  simply receive the live design.
- `src/App.tsx` — the `ready` branch renders `StructureView` + `BookPreview`.
  This EPIC swaps in a `Studio` container that owns design and lays out the
  panel + preview (§2.8).

### 2.2 New file / module layout
```
src/fonts/
  catalog.ts            curated font registry (shared main + worker; no DOM):
                        FontEntry { id, label, stack, embeddable, weights:{regular,bold}, license }
                        SYSTEM_SERIF entry (embeddable:false, no urls) + N embeddable entries.
                        entryForStack(stack): FontEntry | null. FONT_CATALOG: FontEntry[].
  catalog.test.ts
  loadFonts.ts          main-thread: loadFontFace(entry) -> Promise<void> using FontFace +
                        document.fonts (idempotent, cached); warmCatalog() loads all embeddable
                        faces off the critical path. No-op for SYSTEM_SERIF / when FontFace absent.
  loadFonts.test.ts
public/fonts/           curated woff2 files (regular + bold per face), OFL.txt, PROVENANCE.md
src/engine/
  fontFaces.ts          worker-safe: ensureFontLoaded(entry): Promise<void> — fetch the woff2,
                        build FontFace(s), add to self.fonts, await load; cache by id; no-op for
                        SYSTEM_SERIF or where FontFace/self.fonts is absent. Pure of DOM.
  fontFaces.test.ts
src/ui/
  Studio.tsx            owns design state (persisted), warms fonts, lays out ControlPanel + preview
  Studio.test.tsx
  ControlPanel.tsx      the dials; controlled by { design, onChange, onReset }
  ControlPanel.test.tsx
  design/
    trimPresets.ts      TRIM_PRESETS, presetForTrim, convertLength/unit conversion, custom validation
    trimPresets.test.ts
    designPatch.ts      pure setters: applyFontSize, applyLineSpacing, applyTrim, applyMargin, ...;
                        each clamps/validates and re-derives dependent fields (e.g. lineHeightPt).
                        affectsPagination(prev, next): boolean.
    designPatch.test.ts
    persistDesign.ts    loadDesign(): DesignSpec  saveDesign(design): void  (localStorage, versioned,
                        forward-compatible merge onto DEFAULT_DESIGN, invalid -> default)
    persistDesign.test.ts
src/engine/protocol.ts  + WarmFontsMessage
src/engine/client.ts    + warmFonts(fontIds: string[]): void
src/engine/pagination.worker.ts  await ensureFontLoaded before driveEngine; handle 'warm-fonts'
src/ui/BookPreview.tsx  design as prop; engine alive across changes; re-flow without blanking
src/App.tsx             ready branch -> <Studio document report onReset />
src/styles.css          control-panel + studio-layout styles (mobile-first), disabled action state
e2e/typography.spec.ts  live re-flow within budget, trim re-mirror, font renders, 390px panel, persist
```
No new runtime dependency. React, the existing engine, and bundled woff2 files
are sufficient. Do not add a form library, a state-management library, or a
font-loading library.

### 2.3 The dials → `DesignSpec` mapping (exact)
Each control is a controlled input driven by the active `DesignSpec`; on change
it produces a new `DesignSpec` via a pure setter in `design/designPatch.ts` and
calls `onChange(next)`. Setters clamp to the bounds below (input validation at
the boundary) and never emit a design the engine cannot lay out.

| Dial | Field(s) written | Control | Bounds / rules |
|---|---|---|---|
| Page size | `trim = {w,h,unit}` | Select of presets + "Custom size" | Presets set `trim` whole. Custom: `w`,`h` numeric > 0, plus unit toggle. Enforce `inner+outer < w` and `top+bottom < h` after any change (see Margins). |
| Font | `font.family` | Select over `FONT_CATALOG` | Value is the entry's `stack`. Default entry = system serif. |
| Font size | `font.sizePt` | Number stepper | 7–18 pt, step 0.5. Re-derives `lineHeightPt` from the current spacing multiple. |
| Line spacing | `font.lineHeightPt` | Number stepper (multiplier) | Multiple 1.0–2.5, step 0.05. Stored as `lineHeightPt = round(sizePt * multiple, 0.1)`. On load, the control shows `lineHeightPt / sizePt`. |
| Margins | `margins.{inner,outer,top,bottom}` | Four number inputs, unit = `trim.unit` | Each ≥ 0.15 in (or 4 mm) and small enough that `inner+outer < w` and `top+bottom < h`; clamp to keep `columnPx > 0` and at least one text line. |
| Chapter opening | `chapterOpening.topDropPt` | Select: Deep (72) / Standard (36) / Minimal (0) | Named set only (no free number). |
| Chapters open recto | `chapterOpening.startRecto` | Toggle | Off means chapters open on whichever side falls next (no blank verso inserted). |
| Left/right header | `runningHeader.verso` / `runningHeader.recto` | Two selects | Options → stored template: None → `""`, Author → `"{author}"`, Title → `"{title}"`, Chapter → `"{chapter}"`. **Render-only** (see §2.7). |
| Widow & orphan | `widowControl` | Toggle | Boolean. |
| Hyphenation | `hyphenation` | Toggle | Boolean. |

`affectsPagination(prev, next)` returns `false` only when the sole difference is
`runningHeader.verso`/`recto`/`showOnOpener`; otherwise `true`. This is the
switch §2.7 uses to skip the engine for header-only edits.

Unit conversion: when a custom trim's unit changes (or a preset in a different
unit is chosen while custom values exist), convert `w`,`h`, and all four
`margins` to the new unit preserving physical length (`in↔mm`), rounded to 2
decimals for `in` and 0 decimals for `mm`, so the physical page does not jump.
Presets carry their own unit and values verbatim.

### 2.4 Curated fonts (`src/fonts/catalog.ts`, `public/fonts/`)
- Bundle the **system serif default** (the existing
  `'Georgia, "Times New Roman", serif'` stack; `embeddable: false`, no files)
  plus **at least three** open-licensed, embeddable book faces as woff2. Use SIL
  OFL faces so redistribution and later PDF embedding are unencumbered.
  Recommended set (all OFL, Latin subset, regular + bold): **EB Garamond**,
  **Libre Baskerville**, **Source Serif 4**, **Lora**. Two weights per face are
  required because headings measure and render bold (`computeMetrics.headingStyle`
  sets `bold: true`).
- Each `FontEntry.stack` is the primary family plus a system fallback, e.g.
  `'"EB Garamond", Georgia, serif'`. The control writes this exact string to
  `font.family`; `entryForStack` matches it back to the entry (and its files).
- Store the woff2 files under `public/fonts/` (stable, same-origin URLs served by
  Vite in dev and nginx in prod). Add the OFL license text as
  `public/fonts/OFL.txt` and a `public/fonts/PROVENANCE.md` recording each file's
  source, version, and license, mirroring the sample book's provenance note.
  Credit the fonts in the README.
- Fetching same-origin app font files is not the user's file leaving the browser;
  it does not violate the privacy norm and works offline after first load. Say so
  in a code comment so no reviewer mistakes it for an upload path.

### 2.5 On-screen font loading (`src/fonts/loadFonts.ts`, main thread)
- `loadFontFace(entry)` builds a `FontFace` per weight from the entry's URLs,
  calls `.load()`, adds it to `document.fonts`, and resolves; it is idempotent
  (cache by id) and a no-op for `SYSTEM_SERIF` and where `FontFace` is undefined
  (jsdom). `warmCatalog()` loads every embeddable face and swallows individual
  failures (a missing file degrades to the fallback stack; it never throws).
- **Warm off the critical path.** `Studio` calls `warmCatalog()` after first
  paint (e.g. an idle callback or a post-mount effect that does not block the
  initial `paginate`), and eagerly warms on first focus/open of the Font select,
  so selecting a face re-flows from an already-loaded font without a load stall.
  Warming must never add a main-thread long task that trips EPIC 2's 400ms
  long-task budget; rely on async `FontFace.load()`, do not force synchronous
  layout.

### 2.6 Worker-side font loading (accurate measurement) — additive engine change
The worker measures with `OffscreenCanvas`. Canvas uses a font only if it is
present in the worker's `FontFaceSet`; measuring an unloaded curated family
silently falls back to a default face and produces wrong line breaks. So:

- **`src/engine/fontFaces.ts`** — `ensureFontLoaded(entry): Promise<void>`:
  for an embeddable entry, `fetch` each weight's woff2, `new FontFace(family,
  bytes, { weight })`, `await face.load()`, `self.fonts.add(face)`, cache by id.
  No-op for `SYSTEM_SERIF` and where `FontFace`/`self.fonts` is absent. Pure of
  DOM so it unit-tests with a stubbed fetch/FontFace.
- **`pagination.worker.ts`** — before `driveEngine`, resolve the design's font
  via `entryForStack(design.font.family)` and `await ensureFontLoaded(entry)`.
  For the system serif this resolves synchronously to a no-op, so the default
  path adds nothing. For a curated face already warmed, the cached promise
  resolves immediately. Only a cold curated face pays a one-time load, which
  warming (§2.5) has already avoided in the normal flow. Honor latest-wins: if
  `requestId !== currentRequestId` after the await, drop the request.
- **`protocol.ts`** — add `WarmFontsMessage { type: "warm-fonts"; fontIds:
  string[] }`. **`client.ts`** — add `warmFonts(fontIds)` that posts it; the
  worker handles it by `ensureFontLoaded` for each id (fire-and-forget, no
  reply). `Studio` may call `client.warmFonts([...])` when warming so the worker
  and the document warm together. Keep `EngineClientLike` and the fake engines in
  tests in sync with the new method (optional method, defaulted no-op in fakes).
- **Non-regression:** the default/system path posts no `warm-fonts` and awaits a
  no-op, so `pagination.worker.ts`'s existing comment (system serif resolves
  synchronously, no `fonts.ready` gate) stays true. EPIC 2's budget,
  long-task, and determinism specs must pass unchanged.

### 2.7 Live re-flow without blanking (`BookPreview.tsx`)
Change `BookPreview`'s props to `{ document, design, onReset, createEngine? }`.
Keep the engine alive across design changes; re-paginate on design change.

- **Engine lifecycle.** One effect keyed on `document` creates the engine and
  calls `load(document)`; cleanup disposes it. The engine is **not** recreated on
  a design change.
- **Pagination effect** keyed on `design` (and gated on the engine existing):
  call `engine.paginate(design, handlers)`. Coalesce rapid changes with a short
  rAF/`~16ms` debounce; the worker's latest-wins drops superseded passes.
- **State.**
  ```ts
  type State =
    | { status: "laying-out" }                                   // initial, no result yet
    | { status: "first-spread"; pages: Page[]; design: DesignSpec }
    | { status: "ready"; result: PaginationResult; design: DesignSpec; reflowing: boolean }
    | { status: "empty" }
    | { status: "error" };
  ```
  Render each page with the **design that produced it** (carried in state), never
  a half-applied design, so there is no transient overflow.
- **On a design change while `ready`:** if `affectsPagination(prev, next)` is
  `false`, update the committed `design` in place and re-render (no `paginate`) —
  header changes are instant. If `true`, set `reflowing: true` (keep the current
  `result` + its design mounted), call `paginate(next)`; on `done`, swap in the
  new `result` + `next` design and clear `reflowing`; on `progress`, you may
  repaint the leading spread from `firstPages` for top-of-book feedback. Never
  drop to `laying-out` and never reset `scrollTop` on a re-flow.
- **Reflow affordance.** While `reflowing`, set `aria-busy` on the preview region
  and show a quiet, non-layout-shifting indicator. This plus the instant control
  state is the sub-100ms perceptible feedback for a mid-book scroll position; the
  correct geometry arrives on settle (streamed early pages within 100ms).
- **Scroll anchoring.** Before swapping to a new result, capture the scroll
  fraction (`scrollTop / max(1, totalPx - viewportPx)`) and restore it after the
  swap, so the binder stays near their place as the page count changes. Fraction-
  based anchoring is sufficient for this EPIC; chapter-precise anchoring is not
  required.
- **empty/error** unchanged from EPIC 3 (zero-page `done` → empty; `onError` →
  error), including their swept copy.

### 2.8 Studio container & app wiring (`Studio.tsx`, `App.tsx`)
- **`Studio.tsx`** owns the design: initialize from `persistDesign.loadDesign()`
  (which returns `DEFAULT_DESIGN` when nothing valid is stored). It renders the
  `ControlPanel` and `BookPreview` (and keeps `StructureView` as a subordinate
  "what we read" section — do not remove EPIC 1's honest parse/report view).
  `onChange(next)` updates state, calls `saveDesign(next)` (debounced), and flows
  `next` into `BookPreview`. `onReset` sets `DEFAULT_DESIGN` and saves it.
  Warming (§2.5) lives here.
- **Layout.** Mobile-first. At ≤ ~720px, a single column: the control panel
  above the scrolling preview, each control full-width. At wider widths, the
  panel sits in a column beside the preview (the preview keeps its own bounded
  scroll viewport from EPIC 3). No horizontal scroll at 390px.
- **`App.tsx`** `ready` branch renders `<Studio document={state.document}
  report={state.report} onReset={reset} />` in place of the current
  `StructureView` + `BookPreview` pair. `reset` is unchanged.

### 2.9 Control panel structure & radical simplicity (`ControlPanel.tsx`)
- **One primary action slot: Export.** Render it as the visually dominant button,
  **disabled** in this EPIC (export is EPIC 6). Do not implement export. Pair it
  with a short present-tense line stating what it does (see §4). Every dial is
  visibly subordinate to this slot. A second, real secondary action is **Reset**
  (ghost/subdued), which returns to `DEFAULT_DESIGN`.
- **Grouping.** Use `<fieldset>`/`<legend>` for related controls (Page size +
  custom dimensions; Margins; Running headers), so structure is semantic and
  screen-reader navigable. Keep the panel short: labels are as terse as they can
  be while unambiguous (§7 of the bar). No helper paragraphs beyond the single
  Export line and unit hints.
- **Controls are native** (`<select>`, `<input type="number">`,
  `<input type="checkbox">`, `<button>`), each with an associated `<label>`,
  min/max/step where numeric, and a unit affordance where relevant. Native
  controls give keyboard reach, focus, and ~44px targets for free with the
  existing token CSS; size them to ≥44px.

### 2.10 Persistence (`design/persistDesign.ts`)
- `saveDesign(design)` writes `JSON.stringify({ v: 1, design })` to
  `localStorage["bindery.design"]`. `loadDesign()` parses it and returns a design
  built by **merging the stored fields forward onto `DEFAULT_DESIGN`**: unknown
  keys ignored, missing keys defaulted, out-of-range values clamped by the same
  bounds as §2.3. Any parse/shape error returns `DEFAULT_DESIGN` (never throws,
  never blocks first render). This is the forward-only "migration" contract: new
  fields added by later EPICs default cleanly against an old stored blob, and an
  old app ignores unknown stored fields.
- **Privacy.** The stored value is design only. It contains no file bytes, no
  file name, no book text, no PII. Do not persist the `Document` or any parse
  output. Guard all `localStorage` access in `try/catch` (private-mode / disabled
  storage degrades to in-memory, never crashes).

### 2.11 Accessibility & determinism
- Every input has a programmatic label; related groups use `fieldset`/`legend`;
  the panel is a labeled region (`aria-label="Book design"`). Visible focus comes
  from the existing `:focus-visible` rule. Keyboard reaches every control and the
  Reset button; the disabled Export is `disabled` with an accessible name.
- The preview region keeps its EPIC 3 label, keyboard scroll, and sr-only page-
  count summary; `aria-busy` reflects `reflowing`.
- Pure setters and `computeMetrics`/`pagePlacement` are deterministic: the same
  design yields the same pages and the same placement. No `Math.random`/
  `Date.now` in layout or setters. No file text in any error, log, or timing
  hook.

---

## 3. Ordered task list (each maps to acceptance criteria)

### T1 — Pure design logic (`design/`)
`trimPresets.ts`, `designPatch.ts`, `persistDesign.ts` with tests. All pure,
jsdom-safe, no React, no worker.
**AC:** `typecheck`/`lint` pass. Presets set `trim` whole; unit conversion
preserves physical length across `in↔mm`. Each setter clamps to §2.3 bounds and
keeps `columnPx > 0` with ≥1 body line; `applyFontSize` re-derives `lineHeightPt`
from the current multiple; `applyLineSpacing` sets `lineHeightPt = round(sizePt *
multiple, 0.1)`. `affectsPagination` is `false` only for header-only diffs.
`loadDesign` merges forward onto `DEFAULT_DESIGN`, clamps out-of-range values,
and returns the default for malformed/empty/absent storage; `saveDesign` round-
trips through `loadDesign`.

### T2 — Font catalog + loaders (`src/fonts/`, `src/engine/fontFaces.ts`)
Add `catalog.ts` (system serif + ≥3 embeddable OFL faces, regular + bold),
`loadFonts.ts` (main), `fontFaces.ts` (worker-safe), the woff2 files, `OFL.txt`,
and `PROVENANCE.md`. Tests with stubbed `fetch`/`FontFace`.
**AC:** `entryForStack` round-trips each catalog `stack`; `loadFontFace` and
`ensureFontLoaded` are idempotent, no-op for the system serif and where
`FontFace` is absent, and cache by id; `warmCatalog` swallows a per-face failure
without throwing. woff2 files exist and are OFL-licensed with provenance
recorded.

### T3 — Worker font wiring (`protocol.ts`, `client.ts`, `pagination.worker.ts`)
Add `warm-fonts` to the protocol, `warmFonts` to the client and
`EngineClientLike`, and the `await ensureFontLoaded` step before `driveEngine`
plus the `warm-fonts` handler in the worker, honoring latest-wins after the await.
**AC (Vitest with a fake worker/transport where the engine is unit-tested):** the
system-serif paginate path adds no font fetch and no await beyond a resolved no-
op; a curated-face paginate awaits `ensureFontLoaded` before measuring; a stale
request after the await is dropped. EPIC 2's engine/worker unit tests still pass.

### T4 — BookPreview live re-flow (`BookPreview.tsx`)
Lift `design` to a prop; keep the engine alive across design changes; re-paginate
on change without blanking or resetting scroll; carry the producing design in
state; skip the engine for header-only changes; add the `reflowing` affordance
and fraction-based scroll anchoring.
**AC (Vitest, fake engine):** changing `design` calls `paginate` again with the
new design but does **not** recreate/dispose the engine or drop to `laying-out`;
a header-only change re-renders **without** calling `paginate`; during re-flow the
last result stays mounted (bounded node count) and `aria-busy` is set; on `done`
the new result + design swap in; the empty/error paths and copy are unchanged.

### T5 — ControlPanel (`ControlPanel.tsx`)
Build every dial in §2.3 as a native, labeled, controlled input; group related
controls in fieldsets; render the disabled primary Export slot and the Reset
secondary; wire custom-trim inputs to appear only in "Custom size".
**AC (Vitest + Testing Library):** each control reflects the active design and,
on change, calls `onChange` with the correctly-patched design (assert a
representative change per dial); selecting a preset sets `trim` whole; "Custom
size" reveals width/height/unit; Reset calls `onReset`; Export is present and
disabled; every input has an accessible label; a copy-sweep test over the panel's
strings finds no `—`/`–`, no banned vocabulary, no negative phrasing.

### T6 — Studio wiring + persistence + warming (`Studio.tsx`, `App.tsx`, styles)
Introduce `Studio`, own the design (init from `loadDesign`), persist on change
(debounced `saveDesign`), warm fonts off the critical path, lay out panel +
preview mobile-first, retain `StructureView`, and swap `Studio` into `App`'s
`ready` branch. Add control-panel/studio CSS.
**AC (Vitest):** `App.test.tsx`/`states.test.tsx` still pass; the ready state
renders the control panel + `BookPreview` (+ `StructureView`); a change persists
via `saveDesign` and a remount reads it back through `loadDesign`; warming does
not block the initial `paginate`. `typecheck`/`lint`/`test` green.

### T7 — e2e typography harness (`e2e/typography.spec.ts`)
Drive the production build against Middlemarch (300k):
- **Live re-flow within budget:** change a dial (e.g. font size), then read
  `__BINDERY_ENGINE_TIMINGS__` for the re-flow and assert `firstFeedbackMs ≤ 100`
  and `settleMs ≤ 2000`; assert the preview never emptied (a page leaf stays
  mounted throughout) and scroll position was preserved.
- **Trim re-mirror:** switch page size and assert verso/recto text offsets still
  mirror (recto offset > verso) and the column width changed.
- **Font renders:** select a curated face and assert a mounted line's computed
  `font-family` resolves to that face (and `document.fonts.check` for it is true).
- **390px panel:** at 390px the panel is usable with no horizontal scroll
  (`scrollWidth ≤ clientWidth`) and controls are reachable.
- **Persistence:** change dials, reload, assert the controls restore the changed
  values.
**AC:** all pass in Chromium; `e2e/pagination.spec.ts` and `e2e/preview.spec.ts`
still pass unchanged.

### T8 — README + copy sweep
Update the README "Right now it…" paragraph and code-map to describe the
typography dials and live re-flow truthfully; credit the curated fonts and their
license; keep run/test commands accurate. Mechanically sweep every user-visible
string added or edited.
**AC:** README is accurate and lists verified commands; the sweep finds no
`—`/`–`, no banned vocabulary, and no negative empty-state phrasing in any shipped
string or in this spec's §4 example copy.

---

## 4. Copy (swept reference — ship these or better)
The panel is controls, not prose. Keep labels terse. All strings below are swept
(no em-dashes/en-dashes, no banned vocabulary, no negative phrasing):

- Panel region label: **Book design**
- Page size: **Page size**; custom option: **Custom size**; **Width**,
  **Height**, **Units** (values **in**, **mm**)
- Font: **Font** (option for the default: **System serif**)
- Font size: **Font size**
- Line spacing: **Line spacing**
- Margins (legend): **Margins**; **Inner**, **Outer**, **Top**, **Bottom**
- Chapter opening: **Chapter opening** (options **Deep**, **Standard**,
  **Minimal**); toggle: **Open chapters on the right**
- Running headers (legend): **Running headers**; **Left page**, **Right page**
  (options **None**, **Author**, **Title**, **Chapter**)
- Widow & orphan control (toggle): **Widow and orphan control**
- Hyphenation (toggle): **Hyphenation**
- Primary action (disabled): button **Export**; helper line: **Export saves a
  print-ready PDF.**
- Secondary action: **Reset to defaults**

Running heads and folios in the preview are book data (title, author, chapter,
page number), exempt from the sweep. The empty/error/loading strings are
inherited unchanged from EPIC 3 and remain swept.

Sweep before done: reject `—`/`–`, the words `seamlessly / effortlessly / unlock
/ elevate / empower / leverage / robust / dive in` (and kin), and negative
openers (`You don't have`, `No … yet`, `Nothing … here`, `Unable to`,
`Something went wrong`) in every shipped string, including anything added to
`ControlPanel.tsx`, `Studio.tsx`, and font provenance/README copy.

---

## 5. Test plan (which automated test proves each criterion)

### 5.1 Unit / integration (Vitest + jsdom)
| Criterion | Test |
|---|---|
| Setters clamp/derive correctly | `designPatch.test.ts`: size re-derives leading; spacing sets `lineHeightPt`; margins/trim clamp to keep `columnPx > 0`; `affectsPagination` false only for header diffs |
| Trim presets + unit conversion | `trimPresets.test.ts`: preset sets `trim` whole; `in↔mm` conversion preserves physical length |
| Persistence forward-merge | `persistDesign.test.ts`: round-trip; unknown keys ignored; missing defaulted; malformed/empty → `DEFAULT_DESIGN`; out-of-range clamped |
| Catalog + loaders | `catalog.test.ts` / `loadFonts.test.ts` / `fontFaces.test.ts`: `entryForStack` round-trip; idempotent, no-op for system serif and absent `FontFace`; `warmCatalog` swallows failure |
| Worker font wiring | worker/engine unit tests: system path no-op await; curated path awaits load; stale-after-await dropped |
| Live re-flow, no blank | `BookPreview.test.tsx` (fake engine): design change re-paginates without recreating engine or blanking; header-only change skips `paginate`; last result stays mounted + `aria-busy` during reflow; new result swaps on `done` |
| ControlPanel behavior | `ControlPanel.test.tsx`: each dial reflects design and emits the right patch; preset/custom toggle; Reset; disabled Export; labeled inputs |
| Studio + persistence | `Studio.test.tsx`: change persists via `saveDesign`; remount restores via `loadDesign`; ready renders panel + preview (+ structure) |
| Copy swept | `ControlPanel.test.tsx` / `Studio.test.tsx`: no `—`/`–`, no banned vocabulary, no negative phrasing in visible text |
| Existing suites intact | `App.test.tsx`, `states.test.tsx`, engine/worker/preview unit suites still pass |

### 5.2 Browser harness (Playwright, Chromium) — `e2e/typography.spec.ts`
| Criterion | Test |
|---|---|
| Each dial re-flows within budget | change a dial; `__BINDERY_ENGINE_TIMINGS__` shows `firstFeedbackMs ≤ 100`, `settleMs ≤ 2000` on the 300k book; a leaf stays mounted; scroll preserved |
| Trim re-mirrors margins | switch page size; recto text offset > verso; column width changes |
| Curated font renders | select a face; a line's resolved `font-family` is that face; `document.fonts.check` true |
| Panel usable at 390px | no horizontal scroll; controls reachable |
| Settings persist | change dials, reload, controls restore values |
| EPIC 2/3 harnesses unaffected | `pagination.spec.ts` and `preview.spec.ts` still green |

### 5.3 Recorded verification (part of DONE)
Record in `result.json` `summary`: the observed `firstFeedbackMs`/`settleMs` for
a dial-driven re-flow on the 300k book, confirmation that a curated font both
renders and changes the page count (proof the worker measured it), no horizontal
scroll at 390px, and that `pagination.spec.ts` + `preview.spec.ts` still pass.

---

## 6. Data model / migrations
No database and no server. The only persisted artifact is a single
`localStorage` entry (`bindery.design`, `{ v: 1, design }`) holding the working
`DesignSpec`. Its forward-only contract (§2.10) is the "migration": readers merge
stored fields onto `DEFAULT_DESIGN`, so a blob written by any version loads in
any other. `DesignSpec`, `Document`, and `PaginationResult` shapes are unchanged.

---

## 7. QUALITY BAR mapping (binding; budget from the start)
- **§1 Perceived speed / differentiator:** engine-affecting dials ride the warm
  worker's hot path (streamed first feedback ≤100ms, settle ≤~2s on 300k);
  header-only edits and control state update in-frame; the preview never blanks
  or janks; the default path is untouched so EPIC 2's budgets hold.
- **§2 Mobile-first:** the panel is usable at 390px, single-column, ~44px native
  targets, no horizontal scroll; spread/preview behavior from EPIC 3 preserved.
- **§3 Designed states:** re-flow keeps the last book visible with a quiet busy
  affordance (no white flash); empty/error inherited and swept; disabled Export
  is explained, not a dead error.
- **§4 First-run:** the guided walkthrough is EPIC 7 and out of scope; this EPIC
  must not regress EPIC 1's first-run (the sample still loads and now shows
  turnable dials over a real book).
- **§5 Security hygiene:** no server (authz/rate-limit N/A by construction);
  inputs validated/clamped at the control boundary; font files are same-origin
  app assets, not an upload path; `localStorage` guarded; no file text or PII in
  logs.
- **§6 Accessibility:** every input labeled; fieldset/legend grouping; visible
  focus; full keyboard reach; `aria-busy` on re-flow; preview's sr-only page
  count retained.
- **§7 Radically simple interface:** one primary slot (Export), visibly
  subordinate dials, terse labels, native controls, no walls of text.
- **§8 Copy that sounds human:** §4 reference copy is swept; sweep anything added
  before done. Header/folio are book data, exempt.
- **§9 README:** update the "Right now it…" paragraph and code-map to describe the
  dials and live re-flow; credit the curated fonts and license; keep commands
  accurate; no pipeline jargon.

Reconciliation: building the nine dials, their live wiring, curated embeddable
fonts, and session persistence is the scoped work and meeting the bar on it is in
scope. The slider, export/imposition, project files, named presets, the
walkthrough, and fonts beyond the curated set are later EPICs' work and would be
drift here. If meeting the bar appeared to require a Non-Goal, that is a
`blocked`, not a quiet expansion.

---

## 8. Definition of done
- All eight tasks' ACs met; every planner acceptance criterion maps to a passing
  test or a recorded §5.3 measurement.
- `lint`, `typecheck`, `test` (Vitest), and all Playwright specs
  (`typography.spec.ts` new; `pagination.spec.ts` and `preview.spec.ts`
  unchanged) are green.
- Every dial changes the live preview with perceptible feedback under 100ms and
  settles within the EPIC 2 budget; the preview never blanks or resets scroll on
  a change.
- Changing the page size re-mirrors margins and re-widths the column correctly.
- At least three curated faces plus the system serif render in the preview and
  drive pagination (the worker measures the real face, so the page count moves),
  with OFL files and provenance committed; embedding is deferred to EPIC 6.
- The control panel is usable at 390px with ~44px targets and labeled inputs;
  keyboard reaches every control with visible focus.
- The working design persists to `localStorage` and restores on reload; it holds
  design only (no file content, no PII).
- `DEFAULT_DESIGN`, the `Document` model, the parser, and EPIC 2's budgets/
  determinism are unchanged.

### Planner AC → coverage
1. *Each dial changes the live preview with perceptible feedback under 100ms; the
   full re-flow settles within the EPIC 2 budget* → T3, T4, T7; §5.1 re-flow row;
   §5.2 row 1; §5.3.
2. *Changing trim size re-mirrors margins correctly* → T1, T4, T7; §5.1 trim/
   setter rows; §5.2 row 2.
3. *Curated fonts render in preview and are confirmed embeddable (proven end to
   end in EPIC 6)* → T2, T3, T7; §5.1 catalog/worker rows; §5.2 row 3;
   embeddability proof deferred to EPIC 6 by the planner.
4. *Control panel usable at 390px with ~44px targets and labeled inputs; keyboard
   reaches every control with visible focus* → T5, T6, T7; §5.1 ControlPanel row;
   §5.2 row 4.
5. *Settings persist across the session (survive reload in the same browser)* →
   T1, T6, T7; §5.1 persistence + Studio rows; §5.2 row 5.
