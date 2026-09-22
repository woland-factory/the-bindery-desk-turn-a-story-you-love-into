# EPIC SPEC — Polish (final, no new features)

> The last EPIC of The Bindery Desk. Everything ships already: EPUB
> ingest, the worker pagination engine, the virtualized facing-page
> preview, the typography dials, the paper-budget slider and solver, the
> dual PDF export, project/house-style files, and the guided first run.
>
> This EPIC ships **no features and no new controls.** It is a UX,
> performance, accessibility, and copy pass that measures the whole
> product against the QUALITY BAR and the quality differentiator, records
> the numbers, fixes any defect the audit turns up, and finalizes the
> stranger-facing README. Every task below is **audit → record → fix any
> defect found → prove it with an automated test.** When a surface already
> clears the bar, the deliverable is the recorded measurement and the
> permanent test that locks it in, not a change for its own sake.
>
> Because "tighten what exists" is the whole scope, the biggest risk here
> is drift: adding a dial, a setting, an animation, or an abstraction
> nobody asked for. Do not. If the audit reveals something that needs a
> real feature or a re-architecture to fix, that is `blocked` or a
> `requested_task`, never a quiet expansion.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control, above all
the paper-budget slider, re-flows the entire book with perceptible feedback
under 100ms and a settled result within about two seconds on a 300k-word
novel. We do not out-feature InDesign. We make control immediate and
reversible in a way no free path (Word, Calibre, Reedsy) offers.

**What it demands of THIS EPIC:** the polish pass must *prove* the
differentiator with recorded numbers on the real 300k-word file, and it
must not spend a millisecond of that budget. Every tightening here (a copy
fix, a focus ring, a mobile reflow of a control column) is layout and text
only. Nothing this EPIC touches may add work to the hot re-flow path,
recreate the worker, block the main thread, or blank the mounted book
during a pass. If a polish change and the re-flow budget ever conflict, the
budget wins and the change is dropped.

---

## 1. Scope

### In scope
1. **Recorded performance measurement** of the three budgets on real
   files: first meaningful render under ~1s, interaction feedback under
   100ms, and the slider re-flow budget (first feedback ≤100ms, settle
   ≤~2s) on the committed 300k-word novel. The numbers are captured by
   automated tests and copied into `result.json`.
2. **A 390px pass over every surface** the product renders: the import
   dropzone (empty), the loading skeleton, all three error states, the
   structure view, and the full studio (paper-budget slider + bounds,
   control panel + print setup, project/preset disclosure, facing-page
   preview, and the first-run coach-mark). Every feature reachable, no
   horizontal scroll, ~44px touch targets, text readable without zoom.
3. **An accessibility pass** across the same surfaces: sufficient color
   contrast in both light and dark themes, a visible focus ring on every
   interactive element, every input labeled, semantic headings and
   landmarks, keyboard reach to everything a pointer can do, and alt text
   (or a correct `aria-hidden`) on every meaningful image or glyph.
4. **A single, comprehensive copy sweep** over every user-visible string
   in the product (all UI components, the app shell, and the README) for
   em-dashes and en-dashes, the banned LLM vocabulary, and negative
   empty-state phrasing. The sweep is a permanent automated test, not a
   one-time read.
5. **A finalized, stranger-facing README**: what the app is (plain
   language), how to run it (commands verified against the actual
   `Dockerfile` and compose file), how to test it, and where the code
   lives. No factory or pipeline jargon.
6. **Confirm the designed empty/loading/error states everywhere**, and
   close the one designed-states gap the audit found: there is **no
   app-level error boundary**, so an unexpected runtime throw in a surface
   would show a broken/blank React tree instead of a designed error
   screen. Add a minimal error boundary whose fallback reuses the existing
   error styling and product voice with a recovery action. This renders no
   new feature and no new user-facing surface beyond a fallback that only
   appears on an otherwise-unhandled crash. QUALITY BAR §3 requires it
   ("never a raw stack trace, error code, or dead end").
7. **Fixes for any defect the audit surfaces**, kept to the smallest
   change that clears the bar: a missing label, an overflow at 390px, a
   weak-contrast token, a stray em-dash, a stale README line. Layout, ARIA,
   CSS, copy, a small error-boundary fallback, and tests only.

### Out of scope (Non-Goals — building any is a defect)
- **Any new feature, dial, control, setting, budget lever, or preset.**
  This EPIC saves nothing new and renders no new surface.
- **Re-architecting the engine, the preview virtualization, the solver,
  the export path, or any of their output shapes.** They are consumed
  read-only. Their `.ts`/`.tsx` logic is not restructured.
- **New runtime dependencies or a design system.** No component library,
  no CSS framework, no animation library, no icon set. Test-only dev
  helpers are allowed (see §2.1); a runtime dependency is not.
- **Gold-plating past the written bar:** animations nobody specified,
  theming controls, a settings screen, motion polish, speculative
  micro-optimizations of an engine that already meets budget.
- **Behavioral change to any shipped flow.** Import, pagination, the
  slider solve, dial edits, export, project/house-style round-trips, and
  the walkthrough all behave exactly as they do today. A user who never
  hits a fixed defect sees an identical product.
- **Anything already excluded by the product plan:** covers/3D preview,
  accounts/cloud/sync/server, a preset marketplace, InDesign-grade
  microtypography, story editing, non-EPUB inputs, a runtime LLM,
  multi-book sessions.

---

## 2. Technical design

The product is a fully client-side React + TypeScript SPA built with Vite,
tested with Vitest + Testing Library (jsdom) and Playwright (Chromium,
against the production build). There is no server and no endpoint; "every
screen" means every rendered surface. All work here is measurement, tests,
CSS, ARIA, copy, and README.

### 2.1 What this EPIC may and may not touch
- **May edit:** `src/styles.css` (contrast tokens, 390px reflow, focus,
  touch targets), user-visible strings in the surfaces listed in §2.2,
  `README.md`, and test files (new and existing). May add small **test-only**
  helper modules and, if wanted for the a11y audit, a **dev-dependency**
  test tool (e.g. `@axe-core/playwright`) used only in e2e — never shipped
  in the bundle. Contrast is proven dependency-free (§2.5), so axe is
  optional, not required.
- **May NOT edit for behavior:** the engine (`src/engine/*`), the EPUB
  parser (`src/epub/*`), the export pipeline (`src/export/*` logic), the
  solver, the model, or the worker protocols. A copy fix inside one of
  these modules' *user-visible strings* is allowed; a logic change is not.
- **No new files under `src/` that render new UI.** New files are limited
  to tests and (optionally) a pure test helper.

### 2.2 The surface inventory (the concrete "every screen")
Each row is a surface the audit must cover. File paths are where its
strings and structure live.

| Surface | Component(s) | States to cover |
|---|---|---|
| App shell / header | `src/App.tsx` | header title + `▤` mark (decorative), skip-to-main if present, the hidden file input's label |
| Empty / import | `src/ui/ImportSurface.tsx` | dropzone idle + drag-active |
| Loading | `src/ui/LoadingState.tsx` | skeleton, named file vs. sample |
| Error | `src/ui/ErrorState.tsx` | `unreadable`, `too-large`, `sample-failed` |
| Structure | `src/ui/StructureView.tsx` | title, byline, import report disclosure, chapter list |
| Paper budget | `src/ui/budget/BudgetSlider.tsx` | slider, readout (all `Readout` kinds), bounds disclosure |
| Control panel | `src/ui/ControlPanel.tsx` | dials, export button (idle/running/done/error), print-setup disclosure, reset |
| Project / presets | `src/ui/ProjectControls.tsx` | four buttons, notice line, hidden inputs |
| Preview | `src/ui/BookPreview.tsx`, `src/ui/Spread.tsx`, `src/ui/PageView.tsx` | `laying-out`, `first-spread`, `ready`, `empty`, `error` |
| Guided first run | `src/ui/firstRun/Walkthrough.tsx`, `steps.ts` | floating card, docked mobile card, ring |

### 2.3 Performance measurement (audit criterion A)
Two of the three budgets already have harnesses; one does not. Reuse what
exists, add the missing one, and record all three.

- **First meaningful render (< ~1s) — NEW.** Add a Playwright measurement
  (e.g. `e2e/firstrender.spec.ts`) that navigates to `/` on the production
  build and measures the time from navigation start until the first real
  content is painted, using both the empty-state heading becoming visible
  (`getByRole("heading", { name: "Open a book to begin" })`) and the
  browser's `first-contentful-paint` paint entry. Assert both are under
  1000ms and `console.log` the measured values for capture. The app already
  ships a static shell and yields a frame before the synchronous parse
  (`App.runImport`), so this should pass; the deliverable is the recorded
  number and the regression guard.
- **Interaction feedback (< 100ms).** The differentiator's re-flow feedback
  is already measured by `__BINDERY_ENGINE_TIMINGS__.firstFeedbackMs` in
  `e2e/pagination.spec.ts` and `e2e/budget.spec.ts` (asserted ≤100ms).
  Extend the audit to record that a **dial** change (not only the slider)
  gives feedback within 100ms without blanking: after a settled book,
  change a dial and assert the preview keeps a page-leaf mounted and shows
  the `Reflowing` marker / `aria-busy` on `.book` within 100ms, and that
  no `.leaf--skeleton` appears. Non-re-flow presses (buttons, disclosures)
  are covered by the CSS pressed state (`.btn:active` transform,
  `aria-busy` on export) — assert the pressed affordance exists.
- **Slider re-flow budget (300k).** Already proven by
  `e2e/budget.spec.ts` ("re-flows the 300k book within budget and lands
  within one sheet") and `e2e/pagination.spec.ts` (Middlemarch,
  `firstFeedbackMs ≤ 100`, `settleMs ≤ 2000`). Do not weaken these.
  Capture their `console.log` numbers into the run summary.

**Recording.** The implementer's `result.json` `summary` (and, if useful, a
committed `PERF.md` or a report artifact) must state the measured
`firstFeedbackMs`, `settleMs`, `pageCount`, and `wordCount` for Emma
(~150k) and Middlemarch (~300k), plus the measured first-render ms. "Numbers
recorded" is the acceptance criterion; a green boolean is not enough.

### 2.4 390px mobile pass (audit criterion B)
Add one Playwright spec (e.g. `e2e/mobile.spec.ts`) that, at a 390×780
viewport, walks every surface in §2.2 and asserts for each:
- `document.documentElement.scrollWidth <= clientWidth` (no horizontal
  scroll) — the load-bearing check, run on: the empty screen, the error
  screen (force `unreadable` by importing a non-EPUB blob), the structure
  view + studio after opening the sample, with the bounds and print-setup
  disclosures open, and with the first-run card showing.
- The surface's primary control is visible and its touch target height is
  `>= 44` (Choose-EPUB button, Export button, slider thumb row, project
  buttons, walkthrough Skip/Next).
- Body text computed `font-size` is `>= 16px` (readable without zoom); the
  base is 17px, so this guards against a regression.

Existing 390px assertions in `e2e/budget.spec.ts` and `e2e/project.spec.ts`
stay and are not duplicated; the new spec fills the surfaces they skip
(empty, loading, error, structure, control panel, preview). The single-page
preview mode below `BREAKPOINT_PX` (820) means the phone shows one page,
which the audit confirms fits with no overflow. Fix any overflow found with
a CSS-only change (wrap, `min-width: 0`, `overflow-wrap`), never by removing
a feature.

### 2.5 Accessibility pass (audit criterion C)
Prove each a11y property with a targeted automated check; fix any miss.

- **Contrast — dependency-free unit test.** Add `src/theme/contrast.test.ts`
  with a small pure `contrastRatio(hex, hex)` helper (WCAG relative
  luminance; test-only, may live beside the test). Read the theme tokens
  from `:root` and the `prefers-color-scheme: dark` block in
  `src/styles.css` (import the hex values as a small typed map in the test,
  or parse the file) and assert, for **both** light and dark:
  - body text `--ink` on `--bg` and on `--surface` ≥ 4.5:1,
  - secondary text `--ink-soft` on `--surface` and on `--bg` ≥ 4.5:1,
  - primary button `--accent-ink` on `--accent` ≥ 4.5:1,
  - link/accent text `--accent` on `--surface` ≥ 4.5:1 (or ≥ 3:1 where it
    is only used as a large/bold ≥ 18.66px UI label, stated per token),
  - focus ring `--focus` on `--surface` ≥ 3:1.
  If a token fails, adjust that token (darker/lighter) until it passes;
  this is the only sanctioned `styles.css` color change and must keep the
  warm paper aesthetic.
- **Focus visible.** `styles.css` already sets `:focus-visible { outline:
  3px solid var(--focus); outline-offset: 2px }`. Add an e2e keyboard walk
  that tabs through the studio and asserts the active element has a visible
  outline (non-`none` computed `outline-style` / width) on each stop, and
  that every interactive element (buttons, selects, number inputs,
  checkboxes, slider, disclosures, download links) is reachable by Tab in a
  sensible order.
- **Labels.** Every input already has an associated `<label htmlFor>` or
  `aria-label` (verified by reading the components). Add a jsdom test that
  renders the studio with a stub engine and asserts `getByLabelText` finds
  every control by its visible label, and that the hidden EPUB and
  project/preset file inputs expose an `aria-label`.
- **Semantics & landmarks.** Assert one `<main id="main">`, exactly one
  `<h1>` per rendered screen (`Open a book to begin` on empty; the book
  title on the studio), `role="alert"` on the error surfaces,
  `aria-live="polite"` on the loading, readout, export status, page-count,
  and project-notice regions, and that the decorative `▤` mark and skeleton
  carry `aria-hidden`. Consider adding a "Skip to content" link targeting
  `#main` if keyboard users cannot bypass the header; only add it if the
  audit shows a real gap (the header is a single line, so this may be
  unnecessary — decide by the keyboard walk, do not add speculatively).
- **Alt text / meaningful images.** The product renders no `<img>` in its
  chrome (book pages are positioned text, fonts are CSS). Confirm this in
  the audit and record it; the only glyph is the decorative header mark,
  which is correctly `aria-hidden`. If a meaningful image is found, give it
  real `alt`.

### 2.6 Copy sweep (audit criterion D)
Replace the scattered per-component sweeps' *coverage gaps* with one
comprehensive, permanent test (e.g. `src/copy.sweep.test.tsx`). Existing
per-component sweeps (in `BudgetSlider.test.tsx`, `ControlPanel.test.tsx`,
`BookPreview.test.tsx`, `ProjectControls.test.tsx`, `Studio.test.tsx`,
`firstRun/Walkthrough.test.tsx`, `export/*`) may stay; the new test closes
the surfaces that currently have **no** sweep: `ImportSurface`,
`LoadingState`, `ErrorState` (all three kinds), `StructureView`, and the
`App` shell.

The sweep renders each surface (with stub props/engine where needed),
collects its visible `textContent` plus button/label/`aria-label`/
placeholder/`title` attributes, and asserts none matches:
- em-dash or en-dash: `/[—–]/`
- banned vocabulary (case-insensitive): `seamless`, `effortless`, `unlock`,
  `elevate`, `empower`, `leverage`, `robust`, `dive in`,
  `in today's fast-paced world`, `we've got you covered` (and their kin),
- negative empty-state phrasing: `/you don't have|no .* yet|nothing .* here|unable to|something went wrong/i`.

Book/user data (titles, author names, the source filename, import-report
detail strings echoing the file) is exempt — feed the surfaces neutral
fixtures so the sweep tests product copy, not data. The `·` middle-dot
separators in the byline and readout are allowed (not an em/en dash).

**Expected result:** a read of the current strings shows them already
clean (the only `—`/`–` hits in the repo are inside test assertions and
code comments). State this honestly: the deliverable is the comprehensive
guard plus fixes for anything it catches, and the README sweep in §2.7.

### 2.7 README finalization (audit criterion E)
The README is already substantial and stranger-facing. This task verifies
it end to end and fixes any drift; it is not a rewrite.

- **Understand.** The opening two-to-three sentences say plainly what the
  app is and why. Confirm they match shipped behavior (import, live
  re-flow, paper-budget slider, dual export, project/house-style files,
  guided first run) and carry no pipeline jargon.
- **Run — verified commands.** Verify every command against the real files:
  - `npm install` / `npm run dev` (Vite, prints the local URL). The
    `package.json` scripts (`dev`, `build`, `preview`, `lint`, `typecheck`,
    `test`, `test:e2e`) exist and are correct.
  - The Docker path is the **stranger** path: `docker build -t bindery-desk .`
    then `docker run --rm -p 8080:80 bindery-desk`, verified against the
    root `Dockerfile` (multi-stage Node build → nginx on port 80) and the
    optional `SENTRY_DSN` / `UMAMI_URL` / `UMAMI_WEBSITE_ID` runtime env in
    `docker/40-bindery-config.sh`.
  - **Do not point a stranger at `docker-compose.staging.yml`.** That file
    is factory-staging infra: it joins an external `factory-staging-net`
    network and only `expose`s port 80 (no host publish), so
    `docker compose -f docker-compose.staging.yml up` fails on a stranger's
    machine and reaches no port. The README already, correctly, documents
    the plain `docker build`/`docker run` path; keep it that way. This is
    the honest reconciliation of QUALITY BAR §9's "verified against the
    compose files": the compose file is verified to be infra-only and
    therefore intentionally **not** in the stranger's run steps. Record
    this decision in the run summary so a reviewer does not read the
    omission as a miss.
- **Contribute.** The "Where the code lives" map and the test commands
  (`npm test`, `npm run lint`, `npm run typecheck`, `bash scripts/e2e.sh`,
  and the `npx playwright install` fallback) are accurate. Verify the
  `src/` tree map still matches the directories on disk (it lists
  `model/`, `epub/`, `engine/`, `fonts/`, `ui/`, `ui/design/`,
  `ui/budget/`, `ui/firstRun/`, `export/`, `project/`, `integrations/`,
  `config/`, `sample/`) and fix any stale entry.
- **Sweep.** Run the §2.6 sweep over the README prose too (no em/en dash,
  no banned vocabulary, no negative phrasing).

### 2.8 Designed states and the error-boundary safety net (criterion, designed states)
Confirm each designed state in §2.2 reads in the product voice, holds its
layout, and offers a next step: the empty dropzone, the loading skeleton
(layout-stable, `aria-busy`), all three `ErrorState` kinds, and the
preview's own `empty` ("This file has only front matter.") and `error`
("Show the book again") panels. These already exist; the audit confirms
them, it does not replace them.

Close the one gap: add an app-level React error boundary (e.g.
`src/ui/ErrorBoundary.tsx`) wrapping `<App>` at the mount point in
`src/main.tsx`. Its fallback:
- renders a designed surface reusing the existing `surface` /
  `surface__panel--error` styling and product voice, with a heading, a
  short body, and a recovery action (e.g. a "Start over" button that
  reloads to the empty state). No stack trace, no error code, no dead end.
- forwards the error to Sentry if it is initialized (the app already wires
  `@sentry/react` in `src/main.tsx`), and logs no book text or PII.
- swept for banned copy like every other string (§2.6).

This is a safety net, not a feature: on a healthy session it never renders,
and no shipped flow changes. It is the smallest change that satisfies
QUALITY BAR §3's "never a dead end" for an unexpected throw.

### 2.9 Determinism, security, privacy (unchanged, reconfirmed)
This EPIC adds no network path, no storage key, no logging, and no
outbound request. Reconfirm during the audit that saving/opening files and
importing an EPUB still issue no network request (the existing offline /
network-tab checks stay green), and that no book text or PII appears in any
log or error string. No secrets enter tracked files; `.env.example` keeps
placeholders only.

---

## 3. Ordered task list (each maps to a planner acceptance criterion)

### T1 — Performance measurement and recording  →  criterion A
Add `e2e/firstrender.spec.ts` (first meaningful render < 1s, via the
empty-state heading and the FCP paint entry, both logged). Extend the
audit to record a dial-change feedback check (< 100ms, no blank, `Reflowing`
marker within 100ms). Keep and read out the existing Emma/Middlemarch and
slider budgets from `pagination.spec.ts` / `budget.spec.ts`.
**AC:** first-render measured < 1000ms and logged; slider first feedback
≤ 100ms and settle ≤ 2000ms on the 300k file, logged; a dial change shows
feedback ≤ 100ms with the book never blanked; all numbers copied into the
run summary. No perf regression to any existing spec.

### T2 — 390px pass over every surface  →  criterion B
Add `e2e/mobile.spec.ts` covering the empty, loading, error, structure,
control-panel, preview, project, and walkthrough surfaces at 390×780: no
horizontal scroll on each, primary targets ≥ 44px, body font ≥ 16px. Fix
any overflow with a CSS-only change in `styles.css`.
**AC:** every surface in §2.2 passes the no-horizontal-scroll and target-size
checks at 390px; existing 390px specs still pass; any fix is layout/CSS only
and changes no behavior.

### T3 — Accessibility pass  →  criterion C
Add `src/theme/contrast.test.ts` (dependency-free WCAG contrast over the
light and dark tokens, all pairs in §2.5 pass). Add the labels/semantics
jsdom assertions and the e2e keyboard walk (visible focus on every stop,
Tab reaches every control). Fix any failing token, missing label, or
unreachable control with the smallest change.
**AC:** all contrast pairs pass in both themes; every input resolves by its
label; one `<main>` and one `<h1>` per screen; `role="alert"` on errors and
polite live regions on status/notice/readout/count; keyboard reaches every
control with a visible ring; no meaningful image lacks alt (and the
decorative mark stays `aria-hidden`). Findings and fixes recorded.

### T4 — Comprehensive copy sweep  →  criterion D
Add `src/copy.sweep.test.tsx` covering the currently-unswept surfaces
(`ImportSurface`, `LoadingState`, `ErrorState` ×3, `StructureView`, `App`)
with neutral, non-book fixtures. Fix any em/en dash, banned word, or
negative empty-state string it catches.
**AC:** the sweep renders each listed surface and asserts zero em/en dashes,
zero banned vocabulary, and zero negative empty-state phrasing in product
copy (book/user data excluded); the whole `npm test` suite stays green.

### T5 — README finalization  →  criterion E
Verify every README command against `package.json`, the `Dockerfile`, and
`docker/40-bindery-config.sh`; confirm the code map matches the `src/` tree;
keep the stranger run path on `docker build`/`docker run` and record why the
staging compose is intentionally omitted; sweep the prose.
**AC:** a stranger can understand, run (commands verified to work), and
contribute from the README alone; no factory/pipeline jargon; prose passes
the copy sweep; the compose-omission decision is noted in the run summary.

### T6 — Designed states and error-boundary safety net  →  designed states (scope §1.6)
Confirm the empty, loading, and all error surfaces (app and preview) read
in voice, hold layout, and offer a next step. Add `src/ui/ErrorBoundary.tsx`
wrapping `<App>` in `src/main.tsx`, with a designed product-voice fallback
reusing the existing error styling and a recovery action, forwarding to
Sentry when initialized. Add a jsdom test that throws inside a child and
asserts the fallback renders (heading, body, recovery button, no stack
trace) and that its copy passes the sweep.
**AC:** every designed state confirmed; an unexpected throw shows the
designed fallback rather than a blank/broken tree; the boundary never
renders on a healthy session; no shipped flow changes; fallback copy swept.

### T7 — Consolidated verification and recording  →  DONE gate
Run `npm run lint`, `npm run typecheck`, `npm test`, and the full Playwright
suite (`bash scripts/e2e.sh`) to green. Assemble the recorded numbers
(first render, Emma + Middlemarch feedback/settle/pageCount/wordCount,
slider landing), the a11y findings, the sweep result, and the
network-quiet reconfirmation into `result.json` `summary` (and an optional
`report` artifact). Confirm a session that hits no fixed defect is
behaviorally identical to the prior EPIC.
**AC:** all four suites green; every criterion's number/result recorded; no
behavioral change to any shipped flow; zero outstanding audit defects (or,
if one cannot be fixed within scope, the run is `blocked`/a `requested_task`
with the precise reason, never silently shipped).

---

## 4. Copy (reference — the audit fixes toward these, already-shipped)
No new strings are introduced. These are the current, already-swept surface
strings the audit must keep clean; list them so the sweep's expectations are
explicit.

- Empty: **Open a book to begin** / **Drop an EPUB here or choose a file.
  Your book stays on your computer.** / **Choose EPUB file** / **Open the
  sample book**
- Loading: **Reading your book**
- Error (unreadable): **This file is not a readable EPUB.** / **Choose a
  valid .epub and try again.**
- Error (too-large): **This file is larger than the N MB limit.** / **Choose
  a smaller EPUB.**
- Error (sample-failed): **Try opening the sample again.** / **Check your
  connection, then open the sample once more.**
- Structure: **Open another book** / **Show what was set aside** / **Kept …**
  / **Set aside …**
- Preview states: **This file has only front matter.** / **Open another book
  to see it laid out in facing pages.** / **Show the book again** / **The
  layout stopped before it finished. Open the book again to try.**
- Export: **Export saves a print-ready PDF.** / **Saved two files.** / **The
  export stopped before it finished. Try again.**
- Walkthrough: **Open the sample to see a real book.** / **Drag the slider to
  pick your sheet count.** / **Click Export to save your two PDFs.** /
  **Next** / **Skip**

All read as a person wrote them: positive, one idea each, no em-dashes, no
banned vocabulary. If the audit finds a drift from this list, fix it in the
same run.

---

## 5. Test plan (which automated test proves each criterion)

### 5.1 Unit / integration (Vitest + jsdom)
| Criterion | Test |
|---|---|
| Theme contrast passes in light and dark | `src/theme/contrast.test.ts` (new) |
| Every studio input resolves by its label | studio labels test (new, in `copy.sweep`/a11y test) |
| One `<main>`/`<h1>`, alerts, polite live regions | a11y semantics test (new) |
| Product copy clean on unswept surfaces | `src/copy.sweep.test.tsx` (new) |
| Per-component copy still clean | existing sweeps unchanged |
| Error boundary shows a designed fallback, not a crash | `src/ui/ErrorBoundary.test.tsx` (new) |
| No behavioral change to shipped flows | existing engine/export/preview/panel/Studio/App suites unchanged |

### 5.2 Browser harness (Playwright, Chromium, production build)
| Criterion | Test |
|---|---|
| First meaningful render < 1s | `e2e/firstrender.spec.ts` (new), logged |
| Slider first feedback ≤ 100ms, settle ≤ 2s (300k) | `e2e/budget.spec.ts`, `e2e/pagination.spec.ts` (existing), logged |
| Dial-change feedback ≤ 100ms, no blank | new assertion (in `mobile`/`firstrender` or a small perf spec) |
| Every surface usable at 390px, no h-scroll | `e2e/mobile.spec.ts` (new) + existing budget/project 390px |
| Visible focus and full keyboard reach | keyboard-walk test (new, in `mobile.spec.ts` or an a11y spec) |
| No upload on import/save/open; works offline | existing import/export/project network checks unchanged |
| Six existing e2e specs pass unchanged | `import`, `pagination`, `preview`, `typography`, `budget`, `export`, `project` |

### 5.3 Recorded verification (part of DONE)
`result.json` `summary` records: the measured first-render ms; the
Emma/Middlemarch `firstFeedbackMs`, `settleMs`, `pageCount`, `wordCount`;
the slider landing within one sheet; the contrast pass in both themes; the
"no horizontal scroll at 390px on N surfaces" result; the keyboard-reach
result; the copy-sweep result; the README command verification; and the
decision to omit the staging compose from the stranger run path.

---

## 6. Data model / migrations
None. No storage key, schema, model, worker protocol, or file format
changes. `Document`, `DesignSpec`, `PaginationResult`, `ProjectFile`,
`HouseStyle`, and every `bindery.*` storage key are untouched. This EPIC is
forward-compatible by adding nothing.

---

## 7. QUALITY BAR mapping (binding; this EPIC IS the bar audit)
- **§1 Perceived speed / differentiator:** T1 measures and records first
  render < 1s, interaction feedback < 100ms, and the 300k slider budget;
  nothing here touches the hot path.
- **§2 Mobile-first:** T2 proves 390px usability on every surface, not just
  the two already covered.
- **§3 Designed states:** the empty, loading, and all error states are
  audited for voice, layout stability, and a next step; each already exists
  and is confirmed, not replaced. The one gap (no app-level error boundary)
  is closed with a designed fallback so an unexpected throw is never a blank
  tree or a dead end (T6).
- **§4 First-run:** the guided walkthrough already leads a new user drop →
  export once and never returns; T2/T3 confirm it is reachable, non-modal,
  keyboard-friendly, and mobile-docked. No change to its behavior.
- **§5 Security hygiene:** no server, no new route, no outbound path;
  §2.8 reconfirms input validation at the EPUB/file boundary, guarded
  storage, and no PII in logs.
- **§6 Accessibility:** T3 is this clause: contrast (both themes), visible
  focus, labels, semantics/landmarks, keyboard reach, alt text.
- **§7 Radically simple interface:** Export stays the one primary action;
  the audit removes clutter only if it finds any, and adds none.
- **§8 Copy sounds human:** T4 is the mechanical sweep, now comprehensive
  and permanent, plus the README prose in T5.
- **§9 README for strangers:** T5 finalizes and verifies it, with the
  honest staging-compose reconciliation.

Reconciliation: meeting the bar on the existing surfaces is the entire
scope, so none of it is drift. Exceeding it (new controls, motion,
theming, a design system, engine micro-optimization) is drift and a defect.
If a bar clause ever appeared to need a Non-Goal to satisfy, that is
`blocked` with a precise question, never a quiet expansion.

---

## 8. Definition of done
- `npm run lint`, `npm run typecheck`, `npm test`, and the full Playwright
  suite are green; the six prior e2e specs pass unchanged and the new
  `firstrender` / `mobile` (+ a11y) specs pass.
- First meaningful render is measured under ~1s; interaction feedback under
  100ms; the slider re-flow meets the ≤100ms / ≤~2s budget on the 300k-word
  file. All numbers are recorded in `result.json`.
- Every surface in §2.2 passes the 390px check: all features reachable, no
  horizontal scroll, ~44px targets, readable text.
- Accessibility: all contrast pairs pass in light and dark, focus is visible
  on every interactive element, every input is labeled, headings and
  landmarks are semantic, the keyboard reaches everything, and every
  meaningful image has alt (the app renders none in its chrome; the one
  decorative glyph is `aria-hidden`).
- The comprehensive copy sweep finds zero em/en dashes, zero banned
  vocabulary, and zero negative empty-state phrasing across all surfaces and
  the README.
- The empty, loading, and error states are confirmed in voice and layout
  everywhere, and an app-level error boundary shows a designed, product-voice
  fallback with a recovery action instead of a blank tree on an unexpected
  throw.
- The README lets a stranger understand, run (verified commands), and
  contribute, with no pipeline jargon, and the staging-compose omission is
  explained.
- A session that hits no fixed defect is behaviorally identical to the prior
  EPIC: default path, budgets, determinism, export, project round-trips, the
  walkthrough, and golden page counts unchanged.

### Planner AC → coverage
1. *Measured: first meaningful render under ~1s; interaction feedback under
   100ms; slider re-flow meets the EPIC 2/5 budget on the 300k file. Numbers
   recorded.* → §2.3; T1, T6; §5.2 first-render + budget rows; §5.3.
2. *Every screen passes the 390px check.* → §2.4; T2; §5.2 mobile row.
3. *Accessibility: contrast, focus, labels, semantics, keyboard, alt text.*
   → §2.5; T3; §5.1 contrast/labels/semantics rows, §5.2 keyboard-walk row.
4. *Copy sweep: zero em-dashes, banned vocabulary, negative empty-state
   phrasing.* → §2.6; T4; §5.1 sweep row.
5. *README lets a stranger understand, run (verified), and contribute, no
   pipeline jargon.* → §2.7; T5.
