# EPIC SPEC — Project file, house-style presets, and guided first run

> The final feature EPIC of The Bindery Desk. The engine (streamed
> pagination), the facing-page preview, the typography dials, the
> paper-budget slider and solver, and the dual PDF export all ship already.
> This EPIC makes the binder's work **durable and repeatable**, and it walks
> a brand-new visitor through their first book once:
>
> - **Save/open a project file** (durability layer 2): a local JSON file
>   that references the source book and captures every setting, so reopening
>   the same book restores the exact design and paper budget.
> - **Save/apply a house-style preset** (durability layer 3): a
>   settings-only JSON file with no source, so book #12 can inherit the look
>   of books #1 through #11 in one click and re-paginate.
> - **A guided first run**: a short, skippable walkthrough anchored to the
>   real controls that leads a new user from opening a book to exporting it
>   once, then never appears again.
>
> This EPIC adds **no new typography or budget controls**, no cloud sync, no
> account, no server, no preset sharing service, and no version history
> beyond the single project file. It does not change `DEFAULT_DESIGN`, the
> dial set, the pagination engine, the export path, or the engine's output
> shape. Everything stays entirely in the browser; project and preset files
> are ordinary downloads the user opens back from their own disk.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control, above all
the paper-budget slider, re-flows the entire book with perceptible feedback
under 100ms and a settled result within about two seconds on a 300k-word
novel. We make control immediate and reversible in a way no free path (Word,
Calibre, Reedsy) offers.

**What it demands of THIS EPIC:** this EPIC does not run the re-flow, but it
sits on top of the trust the re-flow earns and must not spend it.

- **Restore is exact.** Reopening a project restores the same `DesignSpec`,
  the same solver bounds, and the same print setup, so the deterministic
  engine lays out the byte-identical book the binder saved. "It came back
  the same" is the whole promise of durability layer 2.
- **Apply re-flows, and only that.** Opening a project or applying a house
  style changes the design and lets the existing live re-flow do its job. It
  never runs a second layout path, never re-parses, and never blocks the
  studio. The guided walkthrough points at the live controls; it never
  stands in front of them or freezes the surface it is teaching.

Restore fidelity and a live surface are both in scope from the start.

---

## 1. Scope

### In scope
1. **Project file (open + save).** A local JSON file
   `{ kind, version, source: {name, sha256, byteLength}, design, bounds,
   imposition }`. Saving downloads it; opening reads it back and applies the
   settings to the loaded book. The source is referenced by a content hash,
   never by its bytes: the book is never inside the file.
2. **Exact round-trip.** Save a project from a book, reload the book, open
   the project: the design dials, the solver bounds, and the print setup are
   restored exactly, and the preview re-paginates to the same page and sheet
   count. Proven in unit tests and e2e.
3. **Mismatched-source detection.** When the opened project's `source.sha256`
   differs from the currently loaded book's hash, the app reports it plainly
   in the product's voice and still applies the settings (settings are
   book-agnostic). A matching hash applies silently.
4. **House-style preset (open + save).** A settings-only JSON file
   `{ kind, version, design, bounds, imposition }` with **no source**.
   Applying it to a different book sets the design and re-paginates. Proven
   across two distinct books in unit tests.
5. **Guided first run.** A skippable walkthrough of **three** one-sentence
   imperative steps anchored to real controls: open a book (the sample),
   drag the paper-budget slider, click Export. It advances as the user does
   the real action, is skippable at any step, and is dismissed permanently
   on the first successful export or on Skip. A persisted flag means a
   returning user never sees it.
6. **Robust, forward-only file reading.** Every opened file is validated at
   the boundary and every value is clamped through the **existing**
   sanitizers (`sanitizeDesign`, `sanitizeBounds`, `sanitizeImposition`), so
   a partial, out-of-range, or hand-edited file still yields a layable design
   or a plain error, never a crash.
7. **No upload, ever.** Saving is a browser download; opening reads a local
   file the user picks (same pattern as EPUB import). No project or preset
   file, and no book byte, is ever sent anywhere. Consistent with the hard
   community privacy norm.
8. **Mobile-first, accessible, swept.** The project/preset controls and the
   walkthrough are usable at 390px with ~44px targets and no horizontal
   scroll; every control labeled; notices in a polite live region; the
   walkthrough is non-modal and keyboard-reachable and never traps focus or
   blocks the control it points at. All copy swept.

### Out of scope (Non-Goals — building any is a defect)
- **A preset sharing service or marketplace.** No upload of presets, no
  gallery, no import-by-URL, no discovery surface. Files are local only.
- **Cloud sync or account-based storage.** No account, no login, no server,
  no remote save, no cross-device sync. There is no backend.
- **Version history beyond the single project file.** No autosave timeline,
  no undo stack persisted to disk, no multiple named snapshots inside the
  app. One project file is the unit of durability.
- **New typography or budget controls.** This EPIC saves and restores the
  existing settings; it never adds a dial, a bound, or a budget lever.
- **Changing the engine, the export path, or their output shapes.**
  `DesignSpec`, `Document`, `PaginationResult`, all worker messages, and the
  export modules are consumed read-only (the one additive change is an
  optional `sha256` on `Document.source`, §2.3).
- **Storing book bytes or book text in any file.** A project file holds
  settings plus a source *reference* (name, hash, byte length) only.
- **Editing the story, re-parsing, or a runtime LLM.** No network path
  beyond same-origin app assets.
- **An in-app file browser or picker beyond the browser's own.** Saving uses
  a download; opening uses a native file input.

---

## 2. Technical design

### 2.1 What already exists (consume; change only where named)
- `src/engine/types.ts` — `DesignSpec`, `PaginationResult`. **Unchanged.**
- `src/model/document.ts` — `Document.source` is `{ name, byteLength }`.
  **Gains** an optional `sha256?: string` (§2.3); no other change.
- `src/ui/design/persistDesign.ts` — `sanitizeDesign(raw): DesignSpec`,
  `loadDesign`, `saveDesign`, key `bindery.design`. **Reused unchanged**;
  `sanitizeDesign` validates the `design` field of any opened file.
- `src/ui/budget/persistBudget.ts` — `sanitizeBounds(raw): BudgetBounds`,
  `loadBounds`, `saveBounds`, key `bindery.budget`. **Reused unchanged.**
- `src/export/persistPrint.ts` — `sanitizeImposition(raw): ImpositionOptions`,
  `loadImposition`, `saveImposition`, key `bindery.print`. **Reused
  unchanged.**
- `src/export/impose.ts` — `ImpositionOptions`, `DEFAULT_IMPOSITION`.
  **Unchanged**; the project/house-style files carry an `ImpositionOptions`.
- `src/export/download.ts` — `saveBytes(bytes, filename)` and the filename
  slug helper. **Reused/extended** with a text saver and a generic filename
  helper for `-project.json` / `-housestyle.json` (§2.5); the export
  filenames stay exactly as they are.
- `src/App.tsx` — owns `empty | loading | ready | error`, the import paths
  (`onFile`, `onOpenSample` via `runImport`), and the file input. **Gains**
  the source-hash step at import (§2.3) and the first-run controller plus the
  `Walkthrough` overlay (§2.6).
- `src/ui/Studio.tsx` — owns the working `design`, `bounds`, `imposition`,
  `budgetBase`, the export request, and persistence. **Gains** an
  `applySettings` path used by open-project and apply-house-style, a
  mismatch/notice state, the `ProjectControls` surface, an `onExportDone`
  signal for the tour, and `data-tour` anchors (§2.4, §2.6).
- `src/ui/ImportSurface.tsx` — the empty-state dropzone with the sample
  button. **Gains** a `data-tour="sample"` attribute on the sample button.
- `src/ui/ControlPanel.tsx` — holds the Export button. **Gains** a
  `data-tour="export"` attribute on that button.
- `src/ui/budget/BudgetSlider.tsx` — the range input. **Gains** a
  `data-tour="slider"` attribute on the slider input.

### 2.2 New file / module layout
```
src/project/
  sourceId.ts        async sourceId(bytes: Uint8Array): Promise<string>
                     SHA-256 hex via crypto.subtle. Pure over its input,
                     no DOM, no network. Computed once per import (§2.3).
  sourceId.test.ts
  projectFile.ts     the file model + serialize/parse (§2.4):
                       ProjectFile, HouseStyle, LoadedSettings types;
                       buildProject(source, design, bounds, imposition),
                       buildHouseStyle(design, bounds, imposition),
                       readSettingsFile(text): LoadedSettings | LoadError.
                     Parsing reuses the three existing sanitizers.
  projectFile.test.ts
  projectIo.ts       main-thread IO: saveProject / saveHouseStyle (JSON ->
                     Blob -> download, via download.ts) and readFileText(file).
  projectIo.test.ts
src/ui/ProjectControls.tsx        the subordinate save/open surface (§2.4)
src/ui/ProjectControls.test.tsx
src/ui/firstRun/
  persistFirstRun.ts   isFirstRunDone(): boolean, markFirstRunDone(): void
                       over key `bindery.firstRun`; every touch guarded.
  persistFirstRun.test.ts
  Walkthrough.tsx      the non-modal coach-mark overlay (§2.6)
  Walkthrough.test.tsx
  steps.ts             TOUR_STEPS: the three anchored step copies (one place
                       to sweep). Pure data.
src/model/document.ts               + optional source.sha256
src/App.tsx                         + import hash, first-run controller, overlay
src/ui/Studio.tsx                   + applySettings, notice, ProjectControls, tour hooks
src/ui/ImportSurface.tsx            + data-tour="sample"
src/ui/ControlPanel.tsx             + data-tour="export"
src/ui/budget/BudgetSlider.tsx      + data-tour="slider"
src/export/download.ts              + generic text saver + filename helper (reuse slug)
src/styles.css                      project controls + coach-mark + 390px
e2e/project.spec.ts                 round-trip, house style, walkthrough, mobile
```
No new runtime dependency. `crypto.subtle` and the DOM download path are
platform APIs already available.

### 2.3 Source identity (`src/project/sourceId.ts`, `Document.source.sha256`)
A project file must be able to tell "is this the same book I saved from?"
without holding the book. The honest, cheap identity is a content hash.

- `sourceId(bytes)` returns the lowercase hex SHA-256 of the EPUB bytes via
  `crypto.subtle.digest("SHA-256", bytes)`. It is pure over its input and
  runs **once per import**, at the import boundary, off the hot re-flow path.
  A 64MB digest costs well under the perceived-speed budget and never touches
  a paginate.
- `Document.source` gains `sha256?: string` (optional, forward-compatible).
  The EPUB parser (`parseEpub`) stays pure and synchronous and does **not**
  compute the hash. Instead each import path attaches it after parsing, where
  the bytes are in hand:
  - `App.onFile`: hash the `Uint8Array` it already builds and set
    `document.source.sha256` before moving to `ready`.
  - `sample/loadSample.ts`: hash the fetched sample bytes and set
    `document.source.sha256` on the returned document.
- If `crypto.subtle` is somehow unavailable, `sha256` stays undefined; the
  app still works and a project simply cannot assert a match (treated as
  "unknown", applied without a mismatch notice). This never crashes an
  import.

**No PII / no book text.** The hash and byte length are not book text. The
source `name` is the user's own filename, kept in memory and written only
into a project file the user saves to their own disk; it is never
transmitted and never logged.

### 2.4 File model and controls (`projectFile.ts`, `ProjectControls.tsx`)

**Types.**
```ts
const PROJECT_KIND = "bindery-project";
const HOUSESTYLE_KIND = "bindery-housestyle";
const FILE_VERSION = 1;

interface SourceRef { name: string; sha256?: string; byteLength: number }

interface ProjectFile {
  kind: typeof PROJECT_KIND;
  version: number;
  source: SourceRef;
  design: DesignSpec;
  bounds: BudgetBounds;
  imposition: ImpositionOptions;
}
interface HouseStyle {
  kind: typeof HOUSESTYLE_KIND;
  version: number;
  design: DesignSpec;
  bounds: BudgetBounds;
  imposition: ImpositionOptions;
}

// What the UI applies, regardless of which file kind was opened.
interface LoadedSettings {
  ok: true;
  origin: "project" | "housestyle";
  design: DesignSpec;
  bounds: BudgetBounds;
  imposition: ImpositionOptions;
  source?: SourceRef;            // present only for a project file
}
interface LoadError { ok: false }
```

**Why design + bounds + imposition (and not a stored slider target).** The
paper-budget *target* the user drags to is transient: the solver bakes its
result into the `DesignSpec` (font size, leading, margins). Restoring the
design therefore restores the byte-identical solved book; restoring the
`bounds` restores the solver's rails ("the paper budget"). A separately
stored target would force a re-solve on open for no fidelity gain, so it is
intentionally not stored. This satisfies "restores the exact settings and
paper budget": design + bounds + imposition fully determine the pages.

**Serialize.** `buildProject(source, design, bounds, imposition)` and
`buildHouseStyle(design, bounds, imposition)` return the literal objects
above with the constant `kind` and `version`. No `Date.now`, no randomness,
so two saves of the same state are byte-identical (determinism).

**Parse (`readSettingsFile(text)`).**
1. `JSON.parse` inside try/catch. On throw → `{ ok: false }`.
2. Read `kind`. `PROJECT_KIND` → `origin: "project"`; `HOUSESTYLE_KIND` →
   `origin: "housestyle"`; anything else → `{ ok: false }`.
3. Run `design` through `sanitizeDesign`, `bounds` through `sanitizeBounds`,
   `imposition` through `sanitizeImposition` (each already merges forward
   onto its default and clamps, so a missing or bad field is safe).
4. For a project, read `source` defensively into a `SourceRef` (string
   `name`, optional string `sha256`, numeric `byteLength`); tolerate a
   missing source (leave `source` undefined). `version` is read but a
   higher/lower value is accepted (forward-compatible; the sanitizers absorb
   shape drift).
5. Return `LoadedSettings`.

**`ProjectControls.tsx`.** A visibly subordinate surface in the control
column (below the dials, styled as ghost buttons inside a
`<details><summary>Project and presets</summary>` disclosure so it never
competes with the primary Export action). It renders four labeled buttons
and two hidden native file inputs (same hidden-input-plus-button pattern as
the EPUB import in `App.tsx`):

- **Save project** → `onSaveProject()`.
- **Open project** → clicks the project file input; on change reads the file
  and calls `onOpenFile(text)`.
- **Save house style** → `onSaveHouseStyle()`.
- **Apply house style** → clicks the house-style file input; on change reads
  the file and calls `onOpenFile(text)`.

Both open inputs accept `.json,application/json`. A single polite live-region
line shows the current notice (saved / loaded / mismatch / error). Props are
plain callbacks plus the `notice` string, so the component is trivially
testable with a fake.

**Studio wiring.**
- New state: `notice: string` (default empty) shown via `ProjectControls`.
- `onSaveProject()` builds `source` from `document.source`
  (`{ name, sha256, byteLength }`) plus the current `design`, `bounds`,
  `imposition`, calls `saveProject(...)`, sets notice "Saved your project."
- `onSaveHouseStyle()` builds from `design`, `bounds`, `imposition`, calls
  `saveHouseStyle(...)`, sets notice "Saved your house style."
- `onOpenFile(text)` calls `readSettingsFile(text)`. On `{ ok: false }` set
  the error notice. On success call `applySettings(loaded)`:
  - `setDesign`, `saveDesign`; `setBounds`, `saveBounds`; `setImposition`,
    `saveImposition` (persist so a later reload keeps them).
  - `setBudgetBase(loaded.design)` and `clearSolveDisplay()` so future solves
    anchor to the restored design and no stale solve readout lingers.
  - Setting `design` drives the existing preview re-paginate; **no** extra
    layout path is added.
  - Notice: for a house style → "House style applied." For a project, compare
    `loaded.source?.sha256` to `document.source?.sha256`: both present and
    equal → "Project loaded."; both present and different → the mismatch
    notice (§4); source absent on either side → "Project loaded." (unknown
    match, applied).
- `applySettings` never re-parses, never blanks the mounted book, and never
  touches the export request.

### 2.5 Saving and filenames (`projectIo.ts`, `download.ts`)
- Extend `download.ts` with a generic `saveText(text, filename, mime)` that
  wraps a `Blob`, creates an object URL, clicks a transient `<a download>`,
  and revokes the URL (the same mechanism `saveBytes` already uses; factor
  the shared Blob-download step so both call one helper, or add `saveText`
  beside `saveBytes`). Export's `saveBytes` behavior and the two export
  filenames are unchanged.
- A filename helper produces `<slug>-project.json` and
  `<slug>-housestyle.json`, reusing the existing title-slug logic (lowercase,
  keep `[a-z0-9]`, single-hyphen runs, fall back to `book` when empty). No
  spaces, no em dash, no en dash.
- `projectIo.saveProject(project, title)` and
  `saveHouseStyle(style, title)` serialize with `JSON.stringify(obj, null, 2)`
  and call `saveText(json, filename, "application/json")`.
- `projectIo.readFileText(file): Promise<string>` reads a `File` to text
  (`file.text()`), used by `ProjectControls`.

### 2.6 Guided first run (`firstRun/`, App + Studio wiring)

**Persistence.** `persistFirstRun.ts` reads/writes a boolean under key
`bindery.firstRun` (`{ v: 1, done: true }`), guarded so private-mode or
disabled storage degrades to in-memory (the tour then shows this session and
simply does not persist its dismissal). `isFirstRunDone()` returns false when
nothing valid is stored; `markFirstRunDone()` writes it and never throws.

**Steps (`steps.ts`).** Exactly three, each one short imperative sentence,
each bound to a `data-tour` anchor:
```
1  anchor "sample"  "Open the sample to see a real book."
2  anchor "slider"  "Drag the slider to pick your sheet count."
3  anchor "export"  "Click Export to save your two PDFs."
```

**Controller (in `App.tsx`).**
- On mount: `tour = isFirstRunDone() ? null : { step: 1 }`. If null the
  overlay never mounts (returning user never sees it — the acceptance
  criterion).
- Step 1 → 2 advances automatically when the app state becomes `ready` (a
  book loaded, by drop, file pick, or the sample). An effect on
  `state.status` does this while `tour?.step === 1`.
- Step 2 → 3 advances on the walkthrough's **Next** control (the drag is
  encouraged, not forced; the anchored slider stays fully operable).
- Step 3 ends the tour when the first export completes: `Studio` calls
  `onExportDone` (fired once, when `exportState.kind` becomes `"done"`); App
  then `markFirstRunDone()` and `setTour(null)`.
- **Skip** on any step calls `markFirstRunDone()` and `setTour(null)`, so the
  user is never nagged again.

**`Walkthrough.tsx` (non-modal coach-mark).** Rendered at App level inside
`.app` so it can point at the import surface first and the studio later. It
takes `{ step, text, onNext, onSkip, showNext }`. It locates the current
step's target with `document.querySelector('[data-tour="…"]')`, positions a
small card near it via `getBoundingClientRect` (repositioned on window resize
and scroll), and draws a light highlight ring on the target. It is **not**
modal: no full-screen blocking backdrop, no focus trap; the anchored control
stays clickable and keyboard-focusable so the user completes the real action.
The card holds the step text, a **Skip** button always, and a **Next** button
on step 2 only. The text is in a polite live region. If the target is not in
the DOM yet (e.g. step 2 before the studio mounts), the card hides until it
appears. On a viewport at or below ~430px the card docks to the bottom of the
screen (a bar pointing at the control) rather than floating, so positioning
math never pushes it off-screen. Positioning is best-effort and proven
visually in e2e; presence, text, advancement, Skip, and the persisted flag
are proven in unit tests.

**Anchors.** `data-tour="sample"` on `ImportSurface`'s sample button;
`data-tour="slider"` on `BudgetSlider`'s range input; `data-tour="export"`
on `ControlPanel`'s Export button. These are inert attributes; they change no
behavior and are safe if the tour never runs.

### 2.7 Determinism, security, accessibility
- **Determinism.** `sourceId`, `buildProject`, `buildHouseStyle`, and
  `readSettingsFile` are pure over their inputs; no `Date.now`, no
  `Math.random`. Identical state serializes to identical bytes; an opened
  file always sanitizes to the same design.
- **Security / no upload.** No server, no new outbound path. Opening reads a
  local file the user selects; saving is a browser download. No project/preset
  file or book byte is in any request. Every opened file is validated at the
  boundary and clamped through the existing sanitizers. `JSON.parse` is
  guarded; no `eval`, no dynamic code. Storage access (`bindery.firstRun` and
  the persisted design/bounds/imposition on apply) is try/caught. No book
  text or PII in any log, message, or error.
- **Accessibility.** Project/preset actions are real labeled `<button>`s; the
  hidden file inputs carry `aria-label`s; the notice is one polite live
  region. The walkthrough is non-modal, keyboard-reachable, never traps
  focus, and leaves the anchored control operable; Skip/Next are real buttons
  with visible focus via the existing `:focus-visible` rule; the step text is
  announced politely. All targets clear ~44px at 390px; no horizontal scroll.

---

## 3. Ordered task list (each maps to acceptance criteria)

### T1 — Source identity and model (`sourceId.ts`, `document.ts`, import paths)
Add `sourceId(bytes)` (SHA-256 hex via `crypto.subtle`); add optional
`sha256` to `Document.source`; attach the hash at both import paths
(`App.onFile`, `loadSample`) without making `parseEpub` async.
**AC (Vitest):** `sourceId` returns a 64-char lowercase hex string; identical
bytes hash equal, one flipped byte hashes different; the sample and a file
import both produce a document whose `source.sha256` is set; a missing
`crypto.subtle` leaves `sha256` undefined and does not throw; existing
`parseEpub` tests pass unchanged.

### T2 — File model (`projectFile.ts`, `projectIo.ts`, `download.ts`)
The project/house-style types; `buildProject`, `buildHouseStyle`;
`readSettingsFile` reusing the three sanitizers; the JSON save helpers and the
`-project.json` / `-housestyle.json` filename helper; `readFileText`.
**AC (Vitest):** `buildProject` then `readSettingsFile(JSON.stringify(...))`
round-trips design, bounds, and imposition to values deep-equal to the
sanitized inputs, with `origin: "project"` and the source ref preserved;
`buildHouseStyle` round-trips with `origin: "housestyle"` and no source;
non-JSON text, an unknown `kind`, and an empty object each return
`{ ok: false }`; an out-of-range design/bounds/imposition in the file is
clamped to a layable value by the existing sanitizers; a project with a
missing `source` still loads (source undefined); two `buildProject` calls on
the same state serialize to identical strings; the filename helper lowercases,
hyphenates, strips punctuation, and falls back to `book`; `saveText` builds an
`application/json` blob and revokes its URL; export's `saveBytes` and the two
export filenames are unchanged.

### T3 — Project controls and Studio apply (`ProjectControls.tsx`, `Studio.tsx`)
The subordinate disclosure with four buttons, two hidden inputs, and the
notice line; Studio's `onSaveProject`, `onSaveHouseStyle`, `onOpenFile`,
`applySettings`, and the mismatch/notice logic.
**AC (Vitest + Testing Library, fakes for save/read):** the four buttons are
present, labeled, and visibly subordinate to Export; Save project and Save
house style call their save helper once with a correctly built file and set
the saved notice; Open project reads a file and applies its settings; after
apply, `design`, `bounds`, and `imposition` are updated and persisted (the
three `save*` functions called) and the preview re-paginates (design changed);
a project whose `source.sha256` differs from the loaded book shows the
mismatch notice and still applies; a matching project shows "Project loaded.";
applying a house style built from one document to a **different** document
(two synthetic `Document`s) sets the design and re-paginates and shows "House
style applied."; an unreadable/unknown file shows the plain error notice and
changes no setting; a copy-sweep test over the component's strings finds no
em/en dash, no banned vocabulary, and no negative empty-state phrasing;
existing `Studio` and `App` suites pass.

### T4 — Guided first run (`firstRun/*`, `App.tsx`, anchors)
`persistFirstRun`; `steps.ts`; the `Walkthrough` overlay; the App controller
(mount gate, state-driven step 1→2, Next 2→3, export-done end, Skip); the
`onExportDone` signal from Studio; the three `data-tour` anchors.
**AC (Vitest + Testing Library):** with the flag unset, mounting App shows the
step-1 text and a Skip control; moving to `ready` (open the sample) advances
to the step-2 text; Next advances to step-3 text; signaling export done
removes the overlay and calls `markFirstRunDone` (flag now set); remounting
App with the flag set renders no walkthrough; Skip on any step sets the flag
and removes the overlay; `isFirstRunDone`/`markFirstRunDone` round-trip and a
storage error is swallowed; the `data-tour` anchors exist on the sample
button, the slider input, and the Export button; a copy-sweep test over
`steps.ts` and the overlay's own strings passes.

### T5 — Styles and mobile (`styles.css`)
Style the project/preset disclosure as subordinate ghost actions; style the
coach-mark card, its highlight ring, and its bottom-docked mobile variant.
**AC:** at 390px the project/preset controls and the walkthrough card are
usable with ~44px targets and no horizontal scroll; the coach-mark does not
cover the control it points at; focus states are visible. Verified in e2e
(§T6) and by the 390px check.

### T6 — e2e harness (`e2e/project.spec.ts`, Chromium, production build)
- **Project round-trip:** open the sample, change a dial and drag the slider,
  Save project (capture the download), reopen the sample, Open project
  (`setInputFiles` the captured file), and assert the changed dial value and
  the slider readout are restored.
- **House style save/apply:** save a house style from the sample, then Apply
  house style (the captured file) and assert the notice and that the preview
  re-paginates without error. (The cross-*book* proof lives in the T3 unit
  test with two documents, since only the sample EPUB is committed; note this
  in the spec.)
- **Mismatch notice:** open a project file whose source hash was altered (a
  fixture built in-test from a saved project with a changed `sha256`) against
  the sample and assert the mismatch notice appears and settings still apply.
- **Walkthrough:** a fresh context (cleared storage) shows step 1; opening the
  sample advances it; exporting removes it; a reload does not show it again;
  in a second fresh context, Skip removes it and a reload keeps it hidden.
- **390px:** project controls and the walkthrough usable at 390x780 with no
  horizontal scroll.
**AC:** all pass; `import.spec.ts`, `pagination.spec.ts`, `preview.spec.ts`,
`typography.spec.ts`, `budget.spec.ts`, and `export.spec.ts` pass unchanged.

### T7 — README, copy sweep, recorded verification
Update the README: the "Right now it..." paragraph gains save/open project,
house-style presets, and the guided first run; the code map gains
`src/project/` and `src/ui/firstRun/`; the e2e list gains the project spec.
Mechanically sweep every user-visible string added in T1–T6 and this spec's
§4.
**AC:** README accurate against shipped behavior with verified commands; the
sweep over all added strings and §4 finds no "—"/"–", no banned vocabulary,
and no negative empty-state phrasing; a manual round-trip (save a project,
reload, reopen) is recorded in `result.json`'s `summary`.

---

## 4. Copy (swept reference — ship these or better)
All strings below are swept: no em/en dashes, no banned vocabulary, no
negative empty-state phrasing.

- Project disclosure summary: **Project and presets**
- Buttons: **Save project**, **Open project**, **Save house style**,
  **Apply house style**
- Save notices: **Saved your project.** / **Saved your house style.**
- Project loaded (source matches or unknown): **Project loaded.**
- House style applied: **House style applied.**
- Mismatched source: **Settings applied. This project came from a different
  book.**
- Unreadable / wrong file: **This file did not load. Choose a project or
  house style saved here.**
- Walkthrough steps:
  1. **Open the sample to see a real book.**
  2. **Drag the slider to pick your sheet count.**
  3. **Click Export to save your two PDFs.**
- Walkthrough controls: **Next**, **Skip**
- Filenames: **aesops-fables-project.json**,
  **aesops-fables-housestyle.json** (slug of the book title;
  `book-project.json` when the title is empty)

Book titles, author names, and the source filename written into a project
file are book/user data and exempt from the vocabulary sweep; the product copy
around them is not. Sweep before done: reject "—"/"–", the banned vocabulary
list, and negative openers in every string added to `ProjectControls.tsx`,
`Studio.tsx`, `firstRun/steps.ts`, `Walkthrough.tsx`, and the README.

---

## 5. Test plan (which automated test proves each criterion)

### 5.1 Unit / integration (Vitest + jsdom)
| Criterion | Test |
|---|---|
| Source hash stable and discriminating | `sourceId.test.ts` |
| Import paths attach `source.sha256` | `App.test.tsx` / `sourceId` integration |
| Project round-trips design, bounds, imposition | `projectFile.test.ts` |
| House style round-trips with no source | `projectFile.test.ts` |
| Bad/partial file clamps or reports, never crashes | `projectFile.test.ts` (sanitizers + `{ ok: false }`) |
| Deterministic serialize | `projectFile.test.ts` (two saves equal) |
| Save/open UI builds and applies settings | `ProjectControls.test.tsx` + `Studio.test.tsx` |
| Apply re-paginates and does not re-parse or blank | `Studio.test.tsx` |
| Mismatched source detected and reported, still applies | `Studio.test.tsx` |
| House style applies to a **different** book | `Studio.test.tsx` (two documents) |
| Filename slug safe and swept | `projectIo`/`download.test.ts` |
| First-run flag round-trips, guarded | `persistFirstRun.test.ts` |
| Walkthrough shows, advances, ends, never returns | `Walkthrough.test.tsx` / `App.test.tsx` |
| Skip dismisses permanently | `App.test.tsx` |
| Copy swept | `ProjectControls.test.tsx`, `firstRun` copy test |
| Existing suites intact | engine, export, preview, panel, Studio, App suites unchanged |

### 5.2 Browser harness (Playwright, Chromium) — `e2e/project.spec.ts`
| Criterion | Test |
|---|---|
| Project round-trips settings and paper budget | round-trip test |
| Mismatched source reported plainly | mismatch test |
| House style saved and applied, re-paginates | house-style test |
| Walkthrough walks drop→export, then never returns | walkthrough test |
| Skip dismisses and stays dismissed | walkthrough skip test |
| Mobile 390px | project controls + walkthrough usable, no horizontal scroll |
| Existing harnesses unaffected | the six existing specs pass unchanged |

### 5.3 Recorded verification (part of DONE)
Record in `result.json` `summary`: a manual project round-trip (save a
project from a book, reload, reopen it, settings and sheet count restored),
confirmation that the walkthrough appears for a new visitor and never after
the first export, and confirmation the network tab showed no upload when
saving or opening a file.

---

## 6. Data model / migrations
No database, no server. Storage stays forward-only:
- `bindery.design`, `bindery.budget`, `bindery.print` — existing, reused; a
  project/house-style apply writes through their existing `save*` functions.
- `bindery.firstRun` (new, `{ v: 1, done: true }`) — the first-run flag;
  readers return "not done" on any error and writers never throw. Holds no
  book data.
- `Document.source` gains optional `sha256` (in-memory only; not persisted to
  storage). No other engine or model shape changes.
- **Files (not storage):** the project file
  `{ kind, version, source: {name, sha256, byteLength}, design, bounds,
  imposition }` and the house-style file
  `{ kind, version, design, bounds, imposition }` are downloads/uploads
  under the user's control. A `version` mismatch is tolerated: the sanitizers
  absorb shape drift, so an older or newer file still loads to a layable
  design.

---

## 7. QUALITY BAR mapping (binding; budget from the start)
- **§1 Perceived speed / differentiator:** the hash runs once at import off
  the hot path; applying a project or house style uses the existing live
  re-flow and never adds a second layout pass or blocks the studio; restore
  is exact, so the trust the re-flow earns is preserved.
- **§2 Mobile-first:** project controls and the walkthrough are usable at
  390px with ~44px targets and no horizontal scroll; asserted in e2e.
- **§3 Designed states:** save/open results speak in the product voice
  through one polite notice line; a bad file gets a plain "what to do next"
  message, never a stack trace; the walkthrough is a designed guided surface,
  not a blank overlay.
- **§4 First-run:** the guided walkthrough leads a brand-new user from opening
  the sample to a first export in three anchored steps, skippable, shown only
  until the first export, gone forever after (the persisted flag). This is the
  clause this EPIC most directly delivers.
- **§5 Security hygiene:** no server, no new outbound path, no book bytes or
  files in any request; every opened file validated and clamped at the
  boundary; storage guarded; no book text or PII in logs, messages, or errors.
- **§6 Accessibility:** labeled buttons and inputs; one polite notice region;
  the walkthrough is non-modal, keyboard-reachable, and never traps focus or
  covers its target; visible focus everywhere.
- **§7 Radically simple interface:** Export stays the single primary action;
  project and preset actions hide behind one subordinate disclosure; the
  walkthrough points one short step at a time and gets out of the way.
- **§8 Copy sounds human:** §4 strings are swept; the sweep is a test and a T7
  gate.
- **§9 README:** updated truthfully for save/open, presets, and first run;
  commands verified; no pipeline jargon.

Reconciliation: the project/house-style files, the source hash, the guided
run, and their tests are the scoped work, and meeting the bar on them is in
scope. Preset sharing, cloud sync, and version history stay out however
tempting; if meeting the bar ever appeared to require one of them, that is a
`blocked`, not a quiet expansion.

---

## 8. Definition of done
- All seven tasks' ACs met; `lint`, `typecheck`, `test`, and all seven
  Playwright specs green (`project.spec.ts` new; the other six unchanged).
- A project file round-trips: reopening the same book restores the exact
  design, bounds, and print setup, and the preview re-paginates to the same
  page and sheet count.
- A project opened against a different book reports the mismatch plainly and
  still applies its settings.
- A house style saved from one book applies cleanly to a different book and
  re-paginates (proven across two documents).
- The walkthrough is three one-sentence imperative steps anchored to real
  controls, skippable at any step, shown only until the first export, and
  never shown to a returning user with the persisted flag.
- Every user-visible string added is swept: no em/en dashes, no banned
  vocabulary, no negative empty-state phrasing.
- A session that never saves, opens, or runs the tour is behaviorally
  identical to the prior EPIC: default path, budgets, determinism, export,
  and golden page counts unchanged.

### Planner AC -> coverage
1. *A project file round-trips: reopening restores the exact settings and
   paper budget; a mismatched source is detected and reported plainly.* ->
   §2.3 hash, §2.4 build/parse/apply; T1, T2, T3; §5.1 round-trip + mismatch
   rows; §5.2 round-trip + mismatch tests; §5.3.
2. *A house style saved from one book applies cleanly to a different book and
   re-paginates.* -> §2.4 house-style file + `applySettings`; T2, T3
   two-document test; §5.1 different-book row; §5.2 house-style test.
3. *The walkthrough is 2 to 4 one-sentence imperative steps anchored to real
   controls, skippable at any step, and shown only until first export; a
   returning user with the persisted flag never sees it.* -> §2.6 controller,
   steps, anchors, persistence; T4; §5.1 walkthrough + skip rows; §5.2
   walkthrough tests.
4. *Example step copy is plain and positive, swept for banned tells and
   em-dashes.* -> §4 swept copy; T3/T4 copy-sweep tests; T7 final sweep.
