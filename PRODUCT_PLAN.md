# PRODUCT PLAN — The Bindery Desk

## Core value (one sentence)

Drop the EPUB you already have and, in your own browser, get a real typeset book plus its printer-ready folded signatures in one click, with the file never leaving your computer.

## North star

A binder opens their file and, before touching a single setting, sees a book that already looks like something worth printing: facing pages, mirrored margins, running headers, chapters opening on the right. Then they take hold of it. The paper-budget slider lets them negotiate the physical facts of home printing in real time, watching hundreds of pages breathe as font and margins settle into the sheet count they can afford. The excellent version feels less like formatting and more like adjusting a book that already exists. The standard is trust: a careful craftsperson believes the output enough to feed forty sheets of good paper through their printer without a test page first, and the sewn book on the shelf proves them right.

## Quality differentiator

**Live responsiveness of the whole-book re-flow.** This is the one dimension where the app must clearly beat every existing path (Word templates, Calibre, Reedsy). Any control, and above all the paper-budget slider, re-flows the entire book with perceptible feedback under 100ms and a settled result within about two seconds on a 300k-word novel. The community typesets by hand because it buys control; we win by making that control immediate and reversible. Not more dials than InDesign. Faster, live feedback than anything free.

## Signature moment

The **paper-budget slider**. The user drags "Fit into 30 sheets" and the whole book re-flows in front of them, font size and margins negotiating with the page count live. This mechanic is only possible in a tool that owns typesetting and imposition in the same loop, and it is the interaction a binder describes to their Discord afterward. Every EPIC builds toward it: the engine (EPIC 2) exists to make it instant, the dials (EPIC 4) define the levers it moves, and it ships as its own EPIC (EPIC 5).

---

## MVP user stories

1. As a binder, I drop the EPUB I downloaded from an archive onto the page and see it as a real book within seconds, without formatting anything first.
2. As a binder with no file handy, I open the bundled sample and immediately see what the tool does.
3. As a binder, I turn the dials my Word template encodes (trim size, font, size, spacing, margins, chapter openings, running headers, widow control) and watch the book update live.
4. As a binder on a paper budget, I drag a slider to fit the whole book into N sheets and watch it re-flow to meet the target.
5. As a binder, I export both the typeset book PDF and the printer-ready imposed signature PDF in one click, fonts embedded, nothing uploaded.
6. As a binder, I save my project and my "house style" so book #12 matches books #1 through #11 in one click.
7. As a brand-new visitor, a short guided path walks me through my first book from drop to export, then never appears again.

## Data model sketch

- **Document** (parsed from EPUB): `{ title, author, language, chapters: [{ id, title, blocks: [{ type: heading|paragraph|image|note, level?, text?, src?, keptOrDropped }] }] }`. Normalized; unsupported markup is stripped with a record of what was dropped.
- **DesignSpec**: `{ trim: {w, h, unit}, font: {family, sizePt, lineHeightPt}, margins: {inner, outer, top, bottom}, chapterOpening: {style, startRecto}, runningHeader: {verso, recto, showOnOpener}, widowControl: bool, hyphenation: bool }`.
- **PaperBudget**: `{ targetSheets, sheetsPerSignature, bounds: {fontMinPt, fontMaxPt, marginMin, leadingMin, leadingMax} }`.
- **PaginationResult** (engine output, in a Web Worker): `{ pages: [{ lines: [...geometry], headerText, folio }], pageCount, signatures }`.
- **Project file** (local JSON): `{ version, source: {name, sha256}, design, paperBudget }`.
- **House style preset** (local JSON): `design` + `paperBudget`, no source.

## Screen / endpoint inventory

No server, no backend routes, no accounts. Everything is one static client-side SPA.

- **Studio** (the whole product, one screen): import dropzone that becomes the studio once a book loads. Left/bottom: facing-page preview (virtualized). Right/top: control panel (dials) and the paper-budget slider. Primary action: Export.
- **Export sheet** (modal/panel): typeset PDF + imposed signatures, sheets-per-signature and duplex options.
- **Presets menu**: save/apply house style, save/open project file.
- **First-run guided path**: skippable overlay anchored to the real controls, shown only until first export.
- Designed empty, loading, and error states on the studio surface.

Because there is no server and no upload path, the binding privacy property ("nothing leaves the browser") is enforced structurally. Input validation happens at the EPUB parsing boundary (types, sizes, structure); a malformed file degrades or reports, never crashes.

---

## EPIC list (build order)

Build order is depth-first on the engine, per the validation: get a real book on screen and make its re-flow instant before adding breadth. Imposition math is low-risk and lands late.

### EPIC 1 — App shell, EPUB ingest, and staging deploy
**Scope.** Static SPA scaffold (build tooling, lint, test runner). Fully client-side EPUB import by drag-and-drop and file picker. EPUB parsing into the normalized Document model: spine/TOC chapter detection, text extraction, graceful handling of AO3-style exports and Standard Ebooks/Gutenberg exports (keep or drop inline images and author notes, record what was dropped, never crash). A bundled public-domain sample EPUB that loads with zero user input. Staging deploy scaffold: `Dockerfile` and `docker-compose.staging.yml` serving the static build; `SENTRY_DSN` and Umami (`UMAMI_WEBSITE_ID`/`UMAMI_URL`) wired via env; `.env.example` with placeholders only. README skeleton for strangers.
**Acceptance criteria.**
- `docker compose -f docker-compose.staging.yml up` serves the built app; the bundled sample renders (as raw parsed structure at this stage) within a minute with no user file.
- An AO3-style EPUB and a Standard Ebooks/Gutenberg EPUB each parse into ordered chapters with correct titles; a deliberately malformed EPUB degrades with a designed error state and no crash or blank screen.
- Inline images and author notes are handled per a documented policy; the app records and can report what was kept or dropped.
- No network request carries file content: verified by loading a file with devtools network tab open and by functioning fully offline after first load.
- Error tracking and analytics initialize from env; no secrets in tracked files.

### EPIC 2 — Pagination engine (the risk concentrate)
**Scope.** Measurement-based pagination computed in a Web Worker: text metrics via canvas/Range APIs, greedy line breaking with hyphenation, widow/orphan control, chapter-opening and blank-page rules. Computes geometry and page count for the whole book off the main thread with progressive feedback. Minimal throwaway preview only to validate output; polished rendering is EPIC 3.
**Acceptance criteria.**
- Paginates a real 150k-word EPUB and a real 300k-word EPUB (named test files committed or scripted to download): first page-count and preview feedback within 100ms; full pass settles within about 2 seconds on the 300k-word book, measured and recorded.
- Runs in a Web Worker: the main thread stays responsive (no long-task jank) during a full pass.
- Deterministic: identical input and DesignSpec produce an identical page count across runs.
- Widow/orphan control demonstrably prevents single stranded lines at page and chapter boundaries on the test files.
- If feedback exceeds 100ms or settle exceeds ~2s on the 300k file, the EPIC is failed, not degraded (this is the kill condition from validation).

### EPIC 3 — Live facing-page preview
**Scope.** Virtualized facing-page renderer that lays out geometry for the whole book but renders only visible spreads. Correct book conventions: mirrored inner/outer margins across the gutter, running headers, page numbers (folios), chapters opening recto, blank verso insertion where needed, header/folio suppression on openers and blanks. Mobile-first: single page at 390px, spread on wider viewports. Designed empty, loading (layout-stable skeletons), and error states.
**Acceptance criteria.**
- A 300-page book scrolls smoothly with only visible spreads in the DOM (verified by node count staying bounded while scrolling).
- Margins mirror correctly (inner margin on the gutter side of each page); a printed test spread confirms alignment.
- Running headers and folios are correct, including suppression on chapter-opening and blank pages; chapters open recto.
- Fully usable at 390px with no horizontal scroll; touch targets about 44px; text readable without zoom.
- Empty state names what the screen is for and the first action; loading holds layout; error speaks in the product voice with a next step.

### EPIC 4 — Typography dials
**Scope.** The controls the community fights Word for, and no more: trim/page size (curated presets plus custom dimensions), font (small curated set of embeddable, licensed faces), font size, line spacing, margins, chapter-opening style, running-header content, widow/orphan toggle, hyphenation toggle. Each change re-paginates live through the engine. Radically simple control panel with one obvious primary action (Export) and visibly subordinate secondary controls. Mobile-friendly.
**Acceptance criteria.**
- Each dial changes the live preview with perceptible feedback under 100ms; the full re-flow settles within the EPIC 2 budget.
- Changing trim size re-mirrors margins correctly.
- Curated fonts render in preview and are confirmed embeddable (proven end to end in EPIC 6 export).
- Control panel is usable at 390px with about 44px targets and labeled inputs; keyboard reaches every control with visible focus.
- Settings persist across the session (survive reload within the same browser).

### EPIC 5 — Paper-budget slider (signature moment)
**Scope.** The "Fit into N sheets" slider. A solver negotiates font size, leading, and margins within user-set bounds to hit the target sheet count, re-flowing the whole book live. Shows the resulting sheet and signature count. This is the depth-first investment; it gets the engineering the wow requires.
**Acceptance criteria.**
- Dragging the slider re-flows the whole 300k-word book with perceptible feedback under 100ms and a settled result within about 2 seconds.
- The solver hits the target sheet count within a stated tolerance, or clearly reports the achievable range when the bounds prevent the target (no silent failure, no dead end).
- The solver respects user-set min/max on font size and margins; it never violates a bound to hit a target.
- Reachable from the bundled sample within the first minute with no user file.
- Copy on the slider and its readout is plain and positive; swept for banned tells.

### EPIC 6 — Dual export: typeset PDF + imposed signatures
**Scope.** Client-side PDF generation with embedded fonts (pdf-lib/fontkit class). Typeset book PDF matching the preview geometry (mirrored margins, headers, folios). Imposition math producing a printer-ready signature PDF: configurable sheets-per-signature, duplex/short-edge options, correct fold-to-reading-order (deterministic arithmetic, MIT prior art in bookbinder-js). One-click dual export with progress feedback.
**Acceptance criteria.**
- Both PDFs generate entirely in the browser with no upload (verified with network tab open).
- Fonts are embedded: the typeset PDF renders correctly on a machine that lacks the font.
- Imposed signatures fold into correct reading order, verified against a known small booklet ordering (e.g. an 8-page and a 16-page signature) and a physical fold test on the sample.
- The typeset PDF page count matches the on-screen preview for the same settings.
- Exporting the 300k-word book shows progress and does not freeze the UI; it completes without an out-of-memory failure.

### EPIC 7 — Project file, house-style presets, and guided first run
**Scope.** Save/load a local JSON project file capturing source reference and every setting. Save a settings-only house-style preset and reapply it to a different book (durability layers 2 and 3). Guided first-run path: a short skippable walkthrough anchored to the real controls that walks a new user from drop to export once.
**Acceptance criteria.**
- A project file round-trips: reopening restores the exact DesignSpec and paper budget; a mismatched source is detected and reported plainly.
- A house style saved from one book applies cleanly to a different book and re-paginates.
- The walkthrough is 2 to 4 one-sentence imperative steps anchored to real controls, skippable at any step, and shown only until the first export; a returning user (persisted flag set) never sees it.
- Example step copy is plain and positive, swept for banned tells and em-dashes.

### EPIC 8 — Polish (final, no new features)
**Scope.** A UX and performance pass over the whole delivered product against the QUALITY BAR and the quality differentiator. No new features; tighten what exists. Verify perceived-speed budgets on real files; confirm mobile usability at 390px across every surface; confirm designed empty/loading/error states everywhere; accessibility pass (contrast, focus, labels, semantics, keyboard); mechanical copy sweep of every user-visible string for em-dashes, banned vocabulary, and negative empty-state phrasing; finalize the stranger-facing README (what it is, exact run commands verified against the compose files, how to run tests and where code lives).
**Acceptance criteria.**
- Measured: first meaningful render under ~1s; interaction feedback under 100ms; the slider re-flow meets the EPIC 2/5 budget on the 300k-word file. Numbers recorded.
- Every screen passes the 390px check: all features reachable, no horizontal scroll, ~44px targets, readable text.
- Accessibility: sufficient contrast, visible focus on all interactive elements, every input labeled, semantic headings/landmarks, keyboard reaches everything, alt text on meaningful images.
- Copy sweep run across all components/pages/locale strings; zero em-dashes, zero banned vocabulary, zero negative empty-state phrasing in user-visible strings.
- README lets a stranger understand, run (verified commands), and contribute, with no pipeline jargon.

---

## Non-goals / Out of scope

These are the tempting-but-excluded features. Building any of them is a defect.

- **Covers, dust jackets, and 3D book preview.** That is the bolder sibling variant, not this product.
- **Accounts, login, cloud sync, or any server-side processing or upload.** The privacy norm is a hard requirement; there is no server.
- **A template or preset marketplace / sharing service.** Local presets only.
- **InDesign-grade typography:** kerning-pair editing, drop-cap galleries, ornament libraries, fine microtypography beyond widow/orphan and hyphenation.
- **Editing the story text itself.** This typesets a file; it is not a writing tool.
- **Non-EPUB inputs** (PDF, DOCX, MOBI) in v1. EPUB is the community's standard export.
- **A runtime LLM anywhere.** No BYOK surface, no gateway request; the product has no text-generation feature.
- **Multiple books at once, collaboration, or version history beyond the single project file.**
