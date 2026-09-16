# EPIC SPEC — Paper-budget slider (signature moment)

> EPIC 5 of The Bindery Desk. EPIC 2 built the streamed pagination engine,
> EPIC 3 the facing-page preview, EPIC 4 the typography dials with live
> whole-book re-flow. This EPIC ships the product's signature moment: the
> "Fit into N sheets" slider. A deterministic solver negotiates font size,
> line spacing, and margins within user-set bounds to hit a target sheet
> count, re-flowing the whole book live through the existing warm worker,
> and a readout shows the resulting sheet and signature count. When bounds
> prevent the target, the solver reports the exact achievable count on that
> side, never a silent miss and never a dead end.
>
> This EPIC adds NO new typography dials beyond EPIC 4's nine, NO cover or
> spine math, NO export/imposition (EPIC 6), NO project files or presets
> (EPIC 7), and NO server-side computation. Everything runs in the browser:
> main thread plus the existing pagination worker.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control, above all
this slider, re-flows the entire book with perceptible feedback under 100ms
and a settled result within about two seconds on a 300k-word novel. We do
not out-feature InDesign. We make control immediate and reversible in a way
no free path (Word, Calibre, Reedsy) offers.

**What it demands of THIS EPIC:** the slider is the differentiator's whole
reason to exist, and it is the hardest case: one drag implies a *search*
over designs, not a single pass. The budget is not negotiable:

- **Instant control feedback.** The thumb, the target readout, and a busy
  affordance update in the same frame as the drag. The book's streamed
  `firstPages` land within 100ms of dispatch, exactly as a dial change does.
- **Settled within about 2 seconds on Middlemarch (300k words).** The solve
  may run at most a small, fixed number of exact evaluation passes; the
  design below (predictor narrows, exact counts verify, winner's result is
  reused rather than re-laid-out) is chosen to fit that envelope. If the
  measured drag-to-settle time exceeds the budget on the 300k fixture, the
  EPIC is failed, not shipped degraded; tuning worker internals (fewer
  count passes, a cheaper event-loop yield) to meet it is in scope.
- **Latest-wins under a drag stream.** A drag emits many targets; every
  superseded solve must die promptly (stale checks inside the count loop,
  not just between passes). No backlog, no stale result ever painting.
- **Never blank, never lose the reader's place.** The solve's final result
  flows through the same `progress`/`done` path EPIC 4 re-flows use, so the
  mounted book, the reflow affordance, and fraction-based scroll anchoring
  are inherited, not reimplemented.
- **Exact numbers only.** The readout after settle always states the real
  sheet count of the applied design, taken from the engine's own result.
  The predictor is a search accelerator; it never reaches the user's eyes.

---

## 1. Scope

### In scope
1. **The "Fit into N sheets" slider.** A native range input, prominent at
   the top of the studio's control column, whose value is a target sheet
   count. Dragging it runs the solver and re-flows the whole book live.
   Sheet math for this EPIC: one sheet folded once holds 4 book pages
   (`PAGES_PER_SHEET = 4`, the community's folio standard), and signatures
   are counted at 4 sheets each (`SHEETS_PER_SIGNATURE = 4`, 16 pages).
   Both are named constants with a comment; making them configurable is
   EPIC 6's imposition surface.
2. **The solver.** Deterministic search over a one-dimensional "density
   ladder": a parameter `t ∈ [0, 1]` interpolates the three levers between
   their user bounds (font size in pt, line-spacing multiple, and a margin
   scale applied to the binder's own margins), snapped to the existing dial
   lattice so every candidate is a valid `DesignSpec`. Page count along the
   ladder is monotone (up to snap noise), so the search is: predict from
   the last settled pass's stats, verify with a bounded number of exact
   worker-local counts, apply the best real result.
3. **User-set bounds.** A collapsed "Bounds" disclosure under the slider:
   font size min/max (pt), line spacing min/max (multiple), margins min/max
   (percent of the binder's current margins). The solver never emits a
   design outside them, and never violates the engine's hard floors
   (`clampMargins`, trim minimums). Bounds persist to `localStorage` with
   the same guarded, forward-merge pattern as the design.
4. **Sheet and signature readout.** Always visible next to the slider:
   the current book's sheets and signatures once settled, a quiet busy
   state while a solve runs, and, when the target is out of reach, the
   exact achievable count on that side with a next step (loosen a bound).
   No silent failure, no dead end.
5. **Applied designs are real designs.** The solver's output is set as the
   working design: the EPIC 4 dials move to show what the solver chose, the
   design persists through the existing `persistDesign` path, and Reset to
   defaults still works. A manual dial change simply takes over again.
6. **First-minute reach.** The slider works on the bundled sample with no
   user file: open the sample, drag, watch the book re-flow. Proven in e2e.
7. **Mobile-first, accessible, swept.** Usable at 390px with a ~44px thumb
   and no horizontal scroll; every input labeled; readout announced via a
   polite live region; all copy swept for banned tells.

### Out of scope (Non-Goals — building any is a defect)
- **New typography dials beyond EPIC 4.** The bounds inputs are the
  solver's contract (the planner's "user-set bounds"), not dials: they
  never change the design directly. Do not add any new direct design
  control.
- **Cover or spine math.** No paper-thickness input, no spine width, no
  cover surface of any kind.
- **Server-side computation.** No server exists; the solve runs in the
  existing Web Worker. Do not add any network path.
- **Export, PDF generation, imposition layouts, or signature reordering
  (EPIC 6).** The signature count here is arithmetic for the readout only.
  The Export slot stays a disabled placeholder. `PaginationResult` keeps
  its shape: do not add a `signatures` field to the engine's result.
- **Project files, named presets, guided walkthrough (EPIC 7).** Bounds
  persistence uses its own small key; nothing else is saved.
- **Editing the story text, re-parsing, or changing the `Document` model
  or EPUB parser.**
- **Changing `DEFAULT_DESIGN`, the dial set, or EPIC 2's default path.**
  A session that never touches the slider must behave byte-identically to
  EPIC 4: same first paginate, same budgets, same golden page counts.
- **Any runtime LLM.**

---

## 2. Technical design

### 2.1 What already exists (consume; change only where named below)
- `src/engine/types.ts` — `DesignSpec`, `Page`, `PaginationResult`,
  `Timings`. **Unchanged.**
- `src/engine/engine.ts` — `runEngine` (streamed single pass, yields
  `progress` after `FIRST_PAGES`, `tick` per chapter, terminal `done`) and
  `driveEngine` (slicing + `isStale` cancellation via `EngineTransport`).
  **Unchanged**; the solver drives `runEngine` generators through its own
  transport-like loop with the same slicing and staleness rules.
- `src/engine/paginate.ts` — `computeMetrics` (columnPx, linesPerPage per
  design). **Unchanged**; the predictor and ladder call it.
- `src/engine/measurer.ts` / `offscreenMeasurer.ts` — the worker's memoized
  canvas measurer. **Unchanged.** Its (style, text) cache is what makes the
  solver's repeated passes affordable: a candidate at an already-measured
  font size re-breaks from Map hits alone.
- `src/engine/client.ts` — `EngineClient` (latest-wins, timings hook
  `__BINDERY_ENGINE_TIMINGS__`). **Gains one method** (`solve`, §2.5).
- `src/engine/protocol.ts` — **gains one main→worker message** (`solve`)
  and two small additions to `DoneMessage` (§2.5).
- `src/engine/pagination.worker.ts` — **gains the solve handler** and
  retains lightweight stats of the last completed pass (§2.6).
- `src/ui/design/designPatch.ts` — bounds constants (`FONT_SIZE_MIN/MAX`,
  `LINE_SPACING_*`), `clampMargins`, `affectsPagination`. **Unchanged**;
  the ladder reuses its constants and clamps so solver output always lies
  on the dial lattice (font on the 0.5pt grid, spacing on 0.05, margins
  rounded per unit). No relaxation of `persistDesign` is needed.
- `src/ui/BookPreview.tsx` — engine ownership, streamed re-flow without
  blanking, scroll anchoring, `committedRef`. **Gains three props** and one
  effect (§2.7); its state machine and handlers are reused, not forked.
- `src/ui/Studio.tsx` — owns the design, persists it, warms fonts.
  **Gains** budget state, the `BudgetSlider`, and outcome application
  (§2.8).
- `src/ui/ControlPanel.tsx`, `Spread`, `PageView`, `pageGeometry`,
  `persistDesign`, fonts. **Unchanged.**

### 2.2 New file / module layout
```
src/engine/
  budget.ts            pure, shared main + worker (no DOM):
                       PAGES_PER_SHEET, SHEETS_PER_SIGNATURE,
                       sheetsForPages(pageCount), signaturesForSheets(sheets),
                       BudgetBounds + DEFAULT_BOUNDS + clampBounds(raw),
                       ladderCandidates(base, bounds): DesignSpec[] (snapped, deduped, densest first),
                       PassStats { totalLines, openerPages, blankPages },
                       predictPages(ref: {design, pageCount, stats}, candidate): number,
                       SolveOutcome (shape in §2.5)
  budget.test.ts
  solve.ts             worker-side driver: runSolve(doc, request, measurer, transport)
                       — predictor seed, exact counts with slicing + isStale,
                       winner selection, result reuse (§2.6)
  solve.test.ts
src/ui/budget/
  BudgetSlider.tsx     the slider, readout, and Bounds disclosure
  BudgetSlider.test.tsx
  persistBudget.ts     loadBounds(): BudgetBounds, saveBounds(b): void
                       (localStorage "bindery.budget", versioned, guarded,
                       forward-merge onto DEFAULT_BOUNDS via clampBounds)
  persistBudget.test.ts
src/engine/protocol.ts   + SolveMessage; DoneMessage + stats + solve?
src/engine/client.ts     + solve(request, handlers)
src/engine/pagination.worker.ts  + solve handler; retain last-pass stats
src/ui/BookPreview.tsx   + budget prop, onSolveOutcome, onSettled
src/ui/Studio.tsx        + budget state, budgetBase snapshot, BudgetSlider
src/styles.css           slider (44px thumb), readout, bounds disclosure
e2e/budget.spec.ts       drag budget, tolerance, bounds respect, clamped
                         report, sample reach, 390px
```
No new runtime dependency. Do not add a math/solver library or a state
library; the search is a few dozen arithmetic evaluations and at most a
handful of engine passes.

### 2.3 The density ladder (parameterization — exact)
The solver moves exactly three levers; everything else (trim, font family,
chapter opening, headers, widow control, hyphenation) is carried verbatim
from the base design.

| Lever | Range at t=0 (densest) → t=1 (roomiest) | Snap |
|---|---|---|
| `font.sizePt` | `bounds.fontMinPt` → `bounds.fontMaxPt` | 0.5 pt (`FONT_SIZE_STEP`) |
| line-spacing multiple | `bounds.spacingMin` → `bounds.spacingMax`; stored as `lineHeightPt = round(sizePt × multiple, 0.1)` | 0.05 (`LINE_SPACING_STEP`) |
| margin scale | `bounds.marginsMinPct/100` → `bounds.marginsMaxPct/100`, multiplying each of the base design's four margins, then `clampMargins(trim, ·)` | per-unit rounding (0.01 in / 1 mm) via `clampMargins` |

`ladderCandidates(base, bounds)` samples t finely (e.g. 1/128 steps),
snaps each sample to the lattice above, deduplicates identical designs,
and returns the distinct candidates ordered densest → roomiest. The list
is small (typically well under 100) and pure: same inputs, same list.
Because all three levers grow together with t, page count along the list
is monotone non-decreasing up to ±1–2 pages of snap and widow noise; the
exact-count step (§2.6) absorbs that noise.

**Bounds shape and defaults** (`BudgetBounds`):
```ts
{ fontMinPt: 9, fontMaxPt: 13,       // hard rails: FONT_SIZE_MIN..FONT_SIZE_MAX (7..18)
  spacingMin: 1.15, spacingMax: 1.6, // hard rails: LINE_SPACING_MIN..MAX (1.0..2.5)
  marginsMinPct: 75, marginsMaxPct: 125 } // hard rails: 50..150
```
`clampBounds` clamps each value to its rails and enforces min ≤ max by
raising the max to the min when they cross (deterministic, no swap).
Editing a bound in the UI flows through `clampBounds`.

**Base design (`budgetBase`).** Margin percentages are relative to the
binder's own margins, so repeated solves must not compound. `Studio` keeps
a `budgetBase` snapshot: the working design as of the last *manual* change
(any dial edit, Reset, or initial load). Solver outcomes update the working
design but never `budgetBase`. Every solve request carries `budgetBase` as
its base; its non-lever fields are also the ones carried into candidates.

### 2.4 Predictor (search accelerator, never user-visible)
`predictPages(ref, candidate)` estimates a candidate's page count from the
last settled pass:

- `candLines = ref.stats.totalLines × (candSizePt / refSizePt) × (refColumnPx / candColumnPx)`
  (advance widths scale close to linearly with font size for one family;
  column width comes from `computeMetrics`).
- `overhead = ref.pageCount − ceil(ref.stats.totalLines / refBodyLinesPerPage)`
  (opener capacity loss, blank versos, per-chapter remainders; treated as
  design-independent).
- `predicted = max(1, ceil(candLines / candBodyLinesPerPage) + overhead)`.

The formula's job is only to pick which few candidates get exact counts;
its constants may be refined during a solve by re-anchoring `ref` to the
most recent exact count (§2.6 step 4). Unit tests pin its behavior with
`SyntheticMeasurer`-derived stats, not against real fonts.

### 2.5 Protocol and client (additive)
- **`SolveMessage`** (main → worker):
  ```ts
  { type: "solve"; requestId: number; targetSheets: number;
    base: DesignSpec; bounds: BudgetBounds }
  ```
  Enters the same `currentRequestId` latest-wins stream as `paginate`:
  a newer paginate or solve makes an in-flight solve stale.
- **`DoneMessage` gains two fields** (present on every done, paginate or
  solve):
  - `stats: PassStats` — `{ totalLines, openerPages, blankPages }`,
    tallied while pages are assembled (cheap, no extra pass).
  - `solve?: SolveOutcome` — present only when the request was a solve:
    ```ts
    { targetSheets: number;
      sheets: number;                  // exact, = sheetsForPages(result.pageCount)
      design: DesignSpec;              // the applied (winner) design
      achieved: "hit" | "closest" | "clamped-dense" | "clamped-roomy";
      passes: number }                 // exact counts run, for tests/telemetry
    ```
    `hit`: |sheets − target| ≤ 1 (the stated tolerance). `closest`: bounds
    allow the region but the lattice has no design within tolerance; the
    nearest real count was applied. `clamped-dense` / `clamped-roomy`: the
    target lies beyond the densest/roomiest end of the ladder; the boundary
    design was applied and `sheets` is its exact count (this is the
    "achievable range" report: the exact reachable count on the side the
    user pushed past).
- **`EngineClient.solve(request, handlers)`** — dispatches like `paginate`
  (sets the active request, measures timings from dispatch, publishes to
  `__BINDERY_ENGINE_TIMINGS__` on done, so e2e reads solve timings from the
  existing hook). `PaginateHandlers.onDone` gains the optional trailing
  data: `onDone(result, timings, stats, solve?)`. `EngineClientLike` adds
  `solve?` as optional; test fakes default it to a no-op or scripted
  responder. If `paginate` is called before `load` completes, the existing
  queue behavior stands; `solve` may assume the book is loaded because the
  UI only enables the slider after the first settle (worker still guards:
  a solve with no held document posts the existing error message).

### 2.6 The solve, worker-side (`src/engine/solve.ts`)
On `solve` the worker, after `ensureFontLoaded` for the base's face
(cached no-op in the normal flow, staleness re-checked after the await):

1. **Reference stats.** Use the retained stats of the last completed pass
   (the worker stores `{ design, pageCount, stats }` after every done). If
   none exist (defensive; the UI gates on first settle), run one exact
   count of `base` first and use it as the reference.
2. **Ladder + prediction.** Build `ladderCandidates(base, bounds)`;
   predict every candidate's sheets (pure arithmetic). If the target is
   beyond the predicted densest end, the working candidate is index 0; if
   beyond the roomiest, the last index; otherwise the best-predicted
   candidate.
3. **First feedback.** Start the working candidate's `runEngine` pass and
   forward its first `progress` event to the main thread (this is the
   sub-100ms streamed feedback). Continue draining it to completion as an
   exact count, slicing every ~12ms with the same yield-and-`isStale`
   discipline as `driveEngine`; abandon promptly when superseded.
4. **Verify and correct.** After each exact count, re-anchor the predictor
   to that count and re-pick. Run further exact counts only while the best
   real result is off by more than 1 sheet, the re-pick names an uncounted
   candidate, and fewer than `MAX_SOLVE_PASSES = 3` counts have run.
   Track the best real result: smallest |sheets − target|; ties prefer
   sheets ≤ target (fits the paper the binder has), then the roomier
   design.
5. **Finish.** The winner's full `PaginationResult` was already assembled
   by its count pass (results are kept per counted candidate; at most 3
   are alive, then released). Post `progress` with the winner's first
   pages (skip when the winner was the streamed candidate from step 3),
   then `done` with the winner's result, stats, and the `SolveOutcome`
   (`achieved` per §2.5: clamped when step 2 chose a boundary because the
   target was beyond it; else hit/closest by the ±1-sheet tolerance).
   Retain the winner as the new last-pass stats.

**Special case, free of engine work:** if `targetSheets` equals the sheets
of the last settled pass and that pass's design is the current one, the
worker replies immediately with the retained result and `achieved: "hit"`.
Dragging to where you already are never redesigns the book.

**Determinism.** No randomness, no clocks in decisions (slicing timing
affects only yield cadence, never the chosen winner: the candidate order,
prediction, correction rule, and tie-breaks are pure). Same document, base,
bounds, and target always apply the same design.

**Budget arithmetic** (why this fits ~2s on 300k words): the predictor
costs microseconds; exact counts run against a warm word-width cache, so
they are Map-lookup line breaking plus page assembly, no canvas calls at
already-seen sizes and one cache fill at a new size; at most 3 counts run
and the winner's result is reused rather than re-laid-out, so the only
post-search cost is the structured clone of one result. If measurement on
the 300k fixture still exceeds the budget, reduce `MAX_SOLVE_PASSES` to 2
and/or replace the worker's `setTimeout(0)` yield with a `MessageChannel`
yield (worker-internal, both paths' behavior covered by existing tests).

### 2.7 BookPreview wiring (additive props, no fork)
`BookPreview` gains:
```ts
budget?: { target: number; base: DesignSpec; bounds: BudgetBounds; seq: number } | null;
onSolveOutcome?: (outcome: SolveOutcome) => void;
onSettled?: (settled: { design: DesignSpec; pageCount: number; stats: PassStats }) => void;
```
- **Solve effect**, keyed on `budget?.seq`: debounce ~16ms (the existing
  `REFLOW_DEBOUNCE_MS` pattern), set `reflowing` on the mounted state, then
  `engine.solve({targetSheets, base, bounds}, handlers)` with the SAME
  handlers as `startPaginate` plus outcome handling. Latest-wins in the
  client and worker supersedes older drags automatically.
- **On solve done:** before committing, set
  `committedRef.current = solve.design` and pass the *same object* to
  `onSolveOutcome`. Studio then calls `setDesign(solve.design)`; the
  design-change effect sees `prev === design` (reference equality) and
  does nothing, so the solved result is never re-paginated. Commit the
  result exactly as a paginate done does (`ready`, producing design =
  `solve.design`, scroll anchor restored, empty/error paths unchanged).
- **`onSettled`** fires on every done (paginate or solve) with the design,
  page count, and stats from the message. Studio uses it for the readout
  and the slider range; nothing is recomputed from the pages array on the
  main thread.
- A manual design change while a solve is in flight follows the existing
  path: the paginate supersedes the solve (higher request id), the solve's
  handlers are dropped by the client, and no stale outcome arrives.

### 2.8 Studio and the slider surface
- **State.** `Studio` adds: `bounds` (init `loadBounds()`), `budgetBase`
  (init = the loaded design; updated on every manual `onChange` and on
  Reset, never on solve outcomes), `settled` (latest `onSettled` payload,
  null until first settle), `budgetRequest` (the `budget` prop value;
  bumped `seq` per slider commit), and `solving` (true from slider commit
  until outcome or supersession).
- **Outcome application.** `onSolveOutcome(outcome)`: `setDesign(
  outcome.design)` (same object, per §2.7), persist it through the existing
  debounced `saveDesign`, store the outcome for the readout, clear
  `solving`. The EPIC 4 dials now display the solver's choices, because
  they are controlled by the same design.
- **Bounds edits** flow through `clampBounds`, persist via `saveBounds`,
  and update the slider range; they never touch the design or trigger a
  solve by themselves.
- **Slider range.** min/max = predicted sheets at the ladder's ends for
  (`budgetBase`, `bounds`, `settled` stats), floored/ceiled outward,
  clamped to ≥ 1, and widened if needed to include the current settled
  sheet count. Endpoints are estimates for drag range only; outcomes stay
  exact via clamping (§2.5). When min equals max (a very small book), the
  slider renders disabled with the normal readout.
- **Layout.** `BudgetSlider` renders at the top of the control column,
  above `ControlPanel`, inside the same `.studio__work` flow: first thing
  a binder meets on mobile, beside the preview on desktop. Until the first
  settle it renders disabled with the readout showing the laying-out state.
- **`BudgetSlider.tsx` props:**
  ```ts
  { min, max, value: number;            // value = last outcome/settled sheets, or drag value while dragging
    disabled: boolean;
    solving: boolean;
    readout: Readout;                    // discriminated: settled | solving | clamped | closest
    bounds: BudgetBounds;
    onTarget(sheets: number): void;      // fired per input event; Studio bumps seq
    onBounds(next: BudgetBounds): void }
  ```
  The range input updates its thumb and the visible target text
  synchronously on `input` (that is the in-frame control feedback), sets
  `aria-valuetext` to "N sheets", and carries a real label. The readout is
  a polite `aria-live` region. The Bounds disclosure is a native
  `<details><summary>Bounds</summary>…</details>` holding six labeled
  number inputs (§4 for labels), each ≥ 44px, wrapping cleanly at 390px.

### 2.9 Persistence (`src/ui/budget/persistBudget.ts`)
`saveBounds` writes `{ v: 1, bounds }` to `localStorage["bindery.budget"]`;
`loadBounds` parses, forward-merges unknown/missing keys onto
`DEFAULT_BOUNDS`, clamps through `clampBounds`, and returns defaults on any
error. All access is try/caught (private mode degrades silently). The
stored value is bounds only: no target, no file data, no book text, no PII.
The working design the solver produced persists through the existing
`bindery.design` path untouched, because every solver output is a valid
dial-lattice design (§2.3).

### 2.10 Accessibility and determinism
- Slider: `<label>` plus visible value; `aria-valuetext` in sheets; 44px
  thumb; keyboard arrows adjust by 1 sheet and commit like a drag.
- Readout: single polite live region; `aria-busy` on the preview during a
  solve comes free from the existing `reflowing` flag.
- Bounds: six labeled native inputs inside `fieldset`/`legend` within the
  disclosure; focus visible via the existing `:focus-visible` rule;
  keyboard reaches everything including the summary toggle.
- Determinism: `budget.ts` and `solve.ts` are pure over their inputs; no
  `Date.now`/`Math.random` in any decision; the same drag on the same book
  always lands the same design and readout. No book text in any new
  message, log, or error.

---

## 3. Ordered task list (each maps to acceptance criteria)

### T1 — Pure budget math (`src/engine/budget.ts`, `persistBudget.ts`)
Sheet/signature arithmetic, `BudgetBounds` + `clampBounds` + defaults,
`ladderCandidates`, `predictPages`, `SolveOutcome` type; bounds
persistence. All pure, jsdom-safe.
**AC (Vitest):** `sheetsForPages` and `signaturesForSheets` match hand
computations including edges (0/1 pages → 1 sheet floor honored, exact
multiples); `clampBounds` clamps to rails and resolves min>max
deterministically; `ladderCandidates` output is deduped, densest-first,
every candidate on the dial lattice (font 0.5pt grid, spacing 0.05,
margins per-unit rounded, `clampMargins` respected) and inside the given
bounds, non-lever fields carried verbatim from base; `predictPages` is
exact when candidate = reference and scales in the right direction for
size/column/leading changes; `loadBounds`/`saveBounds` round-trip, merge
forward, clamp, and never throw with storage absent or poisoned.

### T2 — Worker solve (`solve.ts`, `protocol.ts`, `client.ts`, worker)
`SolveMessage`, `DoneMessage.stats` + `solve`, `EngineClient.solve`,
last-pass stats retention, and `runSolve` with slicing, staleness, the
correction loop, tie-breaks, and winner reuse.
**AC (Vitest, `SyntheticMeasurer` + fake transport):** every `done` now
carries stats whose `totalLines` matches the result's pages; a solve
toward an in-range target applies a design within ±1 sheet with
`achieved: "hit"` and `passes ≤ 3`; a target below the densest end
applies the t=0 boundary design with `achieved: "clamped-dense"` and its
exact sheets (mirror for `clamped-roomy`); for a grid of targets across
the range, every applied design and every counted candidate respects the
bounds and hard floors (never violated to get closer); a newer request id
arriving mid-count abandons the solve with no further posts; target ==
current sheets with unchanged design replies from the retained result
without an engine pass; two identical solves yield identical outcomes.
EPIC 2's engine/worker suites pass unchanged.

### T3 — BookPreview budget wiring (`BookPreview.tsx`)
The `budget` prop effect (debounced), shared done handling with
`committedRef` pre-set and object-identity outcome flow, `onSettled` on
every done.
**AC (Vitest, fake engine):** bumping `budget.seq` calls `engine.solve`
once (debounced) with target, base, and bounds; during the solve the
mounted book stays (bounded node count) and `aria-busy` is set; on a solve
done the new result renders with the winner design, scroll anchoring runs,
and `onSolveOutcome` receives the same design object later passed back as
the `design` prop WITHOUT triggering another paginate; `onSettled` fires
with pageCount and stats on both paginate and solve dones; empty/error
paths and copy unchanged.

### T4 — BudgetSlider (`BudgetSlider.tsx`)
Slider, target text, readout states, Bounds disclosure with clamped
editing.
**AC (Vitest + Testing Library):** the thumb and visible target update in
the same event as an input change and `onTarget` fires with the integer
sheet value; keyboard arrows commit; `aria-valuetext` reads "N sheets";
disabled state before first settle; each readout variant renders its §4
string exactly (settled, solving, closest, clamped both sides) inside one
polite live region; bounds inputs are labeled, fire `onBounds` through
`clampBounds` (crossed min/max resolved), and never emit values outside
the rails; a copy-sweep test over the component's strings finds no em/en
dash, no banned vocabulary, no negative phrasing.

### T5 — Studio integration (`Studio.tsx`, styles)
Budget state, `budgetBase` snapshot rules, outcome application +
persistence, slider range derivation, layout and CSS.
**AC (Vitest):** a slider commit sets the `budget` prop with the CURRENT
`budgetBase` and bounds; a solve outcome sets the design (dials reflect
the solver's font size), persists via `saveDesign`, and does not move
`budgetBase`; a manual dial change updates `budgetBase` and clears any
pending solve display state; bounds edits persist via `saveBounds` and
re-derive the slider range; range includes the current settled sheets and
collapses to a disabled slider when min == max; existing `Studio` and
`App` suites pass.

### T6 — e2e budget harness (`e2e/budget.spec.ts`)
Against the production build, Chromium:
- **Budget on 300k:** open Middlemarch, settle, read current sheets from
  the readout; drag to ~80% of current; read
  `__BINDERY_ENGINE_TIMINGS__`: `firstFeedbackMs ≤ 100`,
  `settleMs ≤ 2000`; readout sheets within ±1 of target; a page leaf
  stayed mounted throughout and scroll position was preserved.
- **Solver honesty:** in Bounds, raise font min to equal font max and
  narrow spacing to one step; drag to a target far below the reachable
  range; assert the clamped readout appears with a concrete sheet count,
  the Font size dial still shows a value inside [min, max], and no margin
  input shows less than the floor.
- **Dials follow the solver:** after a successful solve, the Font size
  and Line spacing inputs display the solver's chosen values, and a
  reload restores them (existing design persistence).
- **Sample, first minute:** from a fresh page, open the sample, drag the
  slider once, assert the readout updates to a real sheet count and the
  preview re-flowed, all within the test's default timeout.
- **390px:** slider, readout, and opened Bounds usable at 390×780 with no
  horizontal scroll.
**AC:** all pass; `pagination.spec.ts`, `preview.spec.ts`, and
`typography.spec.ts` pass unchanged.

### T7 — README + copy sweep
Update the README: the "Right now it…" paragraph gains the paper-budget
slider (and stops listing it as a later milestone), the code map gains
`src/ui/budget/` and `src/engine/budget.ts`/`solve.ts`, the e2e list gains
the budget spec. Mechanically sweep every added or edited user-visible
string.
**AC:** README accurate against the shipped behavior and verified
commands; sweep over all strings added in T1–T6 and this spec's §4 finds
no "—"/"–", no banned vocabulary, no negative empty-state phrasing.

---

## 4. Copy (swept reference — ship these or better)
All strings below are swept: no em/en dashes, no banned vocabulary, no
negative phrasing. Numbers are examples.

- Slider label: **Fit into**; value text beside it: **52 sheets**
- Readout, settled or hit: **52 sheets · 13 signatures of 4 sheets**
- Readout, while solving: **Fitting your book**
- Readout, closest (lattice gap): **Closest inside your bounds: 54 sheets**
- Readout, target below reach: **Your bounds reach 61 sheets at the
  tightest. Loosen a bound to go lower.**
- Readout, target above reach: **Your bounds reach 44 sheets at the
  roomiest. Loosen a bound to go higher.**
- Before the first settle: **Laying out your book**
- Disclosure summary: **Bounds**
- Bounds labels: **Font size min (pt)**, **Font size max (pt)**,
  **Line spacing min**, **Line spacing max**, **Margins min (%)**,
  **Margins max (%)**

Sheet and signature figures are book data and exempt from the sweep, but
the sentences around them are not. Sweep before done: reject "—"/"–", the
banned vocabulary list, and negative openers in every string added to
`BudgetSlider.tsx`, `Studio.tsx`, worker error messages, and the README.

---

## 5. Test plan (which automated test proves each criterion)

### 5.1 Unit / integration (Vitest + jsdom)
| Criterion | Test |
|---|---|
| Sheet/signature math exact | `budget.test.ts`: hand-computed tables incl. edges |
| Ladder valid, in-bounds, on-lattice, deterministic | `budget.test.ts`: lattice/bounds/dedup/order asserts |
| Bounds clamped, persisted, crash-free | `budget.test.ts` + `persistBudget.test.ts` |
| Solver hits within ±1 sheet or reports honestly | `solve.test.ts`: in-range grid → hit; boundary targets → clamped with exact count |
| Bounds never violated to hit a target | `solve.test.ts`: every counted candidate and winner inside bounds/floors across a target grid |
| Latest-wins mid-solve | `solve.test.ts`: staleness during a count stops all posts |
| No-op target short-circuits | `solve.test.ts`: retained-result reply, zero passes |
| Deterministic outcomes | `solve.test.ts`: repeat solve equality |
| Stats on every done | worker/client tests: `stats.totalLines` matches pages |
| Solve flows through preview without blank/scroll loss or double paginate | `BookPreview.test.tsx` (fake engine): T3 asserts |
| Slider feedback in-frame; readout states; a11y | `BudgetSlider.test.tsx` |
| Studio applies outcome, snapshots base, persists | `Studio.test.tsx` |
| Copy swept | `BudgetSlider.test.tsx` string sweep |
| Existing suites intact | engine, worker, preview, panel, Studio, App suites unchanged |

### 5.2 Browser harness (Playwright, Chromium) — `e2e/budget.spec.ts`
| Criterion | Test |
|---|---|
| Drag re-flows 300k book: feedback ≤ 100ms, settle ≤ 2s | timings-hook assert on Middlemarch (T6 test 1) |
| Target hit within stated tolerance (±1 sheet) | readout vs target on Middlemarch |
| Never blanks, keeps place | leaf mounted + scrollTop preserved during solve |
| Honest clamped report, bounds respected | pinched-bounds test (T6 test 2) |
| Solver output is the real design and persists | dials-follow-solver + reload test |
| Reachable from the sample, first minute, no file | sample drag test |
| Mobile 390px | no horizontal scroll, controls usable |
| EPIC 2/3/4 harnesses unaffected | existing three specs pass unchanged |

### 5.3 Recorded verification (part of DONE)
Record in `result.json` `summary`: the observed `firstFeedbackMs` and
`settleMs` for a slider-driven solve on Middlemarch, the target vs
achieved sheet count from that run, the number of solve passes, and
confirmation that the pinched-bounds run reported the clamped count with
no bound violated.

---

## 6. Data model / migrations
No database, no server. Two `localStorage` entries, both forward-only:
- `bindery.design` (existing, `{v:1, design}`) — untouched; solver output
  is a valid design under the existing sanitize path.
- `bindery.budget` (new, `{v:1, bounds}`) — readers merge stored keys onto
  `DEFAULT_BOUNDS` and clamp via `clampBounds`; unknown keys are ignored,
  malformed blobs yield defaults. A blob written by any version loads in
  any other.
Engine shapes (`DesignSpec`, `Document`, `PaginationResult`) are
unchanged; `DoneMessage` gains additive fields only, and no old reader of
that message exists outside this app.

---

## 7. QUALITY BAR mapping (binding; budget from the start)
- **§1 Perceived speed / differentiator:** in-frame thumb + readout
  feedback; streamed first pages ≤ 100ms; solve settles within ~2s on
  300k via predictor + bounded exact counts + winner reuse; measured and
  asserted in e2e; the untouched default path keeps EPIC 2's budgets.
- **§2 Mobile-first:** slider first in the column at 390px, 44px thumb,
  bounds inputs wrap, no horizontal scroll; asserted in e2e.
- **§3 Designed states:** pre-settle disabled state says what is
  happening; solving state is quiet and layout-stable; clamped state
  names the reachable count and the next step; the preview never blanks.
- **§4 First-run:** the sample reaches the signature moment in the first
  minute with no file (e2e-proven). The guided walkthrough remains
  EPIC 7's work.
- **§5 Security hygiene:** no server, no new network path; bounds inputs
  clamped at the boundary; `localStorage` guarded; no book text or PII in
  messages, storage, or logs.
- **§6 Accessibility:** labeled slider with `aria-valuetext`, keyboard
  commits, labeled bounds inputs in a fieldset, one polite live region,
  visible focus everywhere.
- **§7 Radically simple interface:** the slider says its one idea in two
  words and a number; the readout is one line; bounds hide behind one
  disclosure; Export remains the single primary action slot.
- **§8 Copy sounds human:** §4 strings are swept; the sweep is a test and
  a T7 gate.
- **§9 README:** updated truthfully for the slider; commands unchanged
  and still verified; no pipeline jargon.

Reconciliation: the slider, solver, bounds, readout, and their tests are
the scoped work, and meeting the bar on them is in scope. Imposition
options, cover math, presets, and the walkthrough stay out however
tempting; if meeting the bar ever appeared to require one of them, that is
a `blocked`, not a quiet expansion.

---

## 8. Definition of done
- All seven tasks' ACs met; `lint`, `typecheck`, `test`, and all four
  Playwright specs green (`budget.spec.ts` new; the other three
  unchanged).
- Dragging the slider on Middlemarch gives in-frame control feedback,
  streamed book feedback ≤ 100ms, and a settled, exact result ≤ ~2s,
  recorded per §5.3. Exceeding the budget on the 300k fixture is a failed
  EPIC, not a shipped degradation.
- The solver lands within ±1 sheet of any reachable target, and reports
  the exact reachable count with a next step when the target is beyond
  the bounds. It never violates a user bound or an engine floor.
- The applied design is the working design: dials reflect it, it persists
  and reloads, Reset still returns to `DEFAULT_DESIGN`, and repeated
  solves never compound margin scaling (base snapshot rule).
- The sample book demonstrates the slider with no user file, within the
  first minute.
- A session that never touches the slider is behaviorally identical to
  EPIC 4: default path, budgets, determinism, and golden page counts
  unchanged.

### Planner AC → coverage
1. *Dragging the slider re-flows the whole 300k-word book with perceptible
   feedback under 100ms and a settled result within about 2 seconds* →
   §2.6 budget arithmetic, T2, T3, T6 test 1; §5.2 row 1; §5.3.
2. *The solver hits the target sheet count within a stated tolerance, or
   clearly reports the achievable range when bounds prevent the target* →
   tolerance stated as ±1 sheet (§2.5); clamped outcomes carry the exact
   boundary count and the readout names it with a next step (§2.5, §4);
   T2, T4, T6 test 2; §5.1 solver rows; §5.2 rows 2 and 4.
3. *The solver respects user-set min/max on font size and margins and
   never violates a bound to hit a target* → ladder construction (§2.3),
   bounds-never-violated property tests (T2), pinched-bounds e2e (T6);
   §5.1 bounds row; §5.2 row 4.
4. *Reachable from the bundled sample within the first minute with no user
   file* → T6 sample test; §5.2 row 6.
5. *Slider copy and readout are plain and positive, swept for banned tells
   and em-dashes* → §4 reference strings, sweep test in T4, T7 gate;
   §5.1 copy row.
