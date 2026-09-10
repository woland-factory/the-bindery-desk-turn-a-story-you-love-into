# EPIC SPEC — App shell, EPUB ingest, and staging deploy

> EPIC 1 of The Bindery Desk. Depth-first build order: get a real book's
> structure into memory and prove the privacy property before any
> typography lands. This EPIC ships the scaffold, the fully client-side
> EPUB parser, a bundled sample, and the staging deploy plumbing. No
> preview typography, no dials, no engine, no server.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control, above all
the paper-budget slider, must re-flow the entire book with perceptible
feedback under 100ms and settle within about two seconds on a 300k-word
novel.

**What it demands of THIS EPIC:** this EPIC builds no re-flow, but it
builds the thing the re-flow runs on. The parsed `Document` model must be
a clean, normalized, in-memory structure the pagination engine (EPIC 2)
can walk repeatedly without ever re-parsing the EPUB or touching the ZIP
again. That means: parse once, keep flat arrays of typed text blocks, no
live DOM references retained, no lazy re-reads of the archive. Parsing a
large EPUB must not block the main thread long enough to feel broken
(show a loading state; keep the heavy work interruptible and off the
critical render path). A model that forces the engine to re-read files or
re-parse XHTML on every re-flow would make the differentiator
unreachable later. Build the model so EPIC 2 can be instant.

---

## 1. Scope

### In scope
1. **Static SPA scaffold.** Vite + React + TypeScript. ESLint + Prettier.
   Vitest + React Testing Library. `npm run dev`, `build`, `lint`,
   `typecheck`, `test` all work. No backend, no routes, no accounts.
2. **Client-side EPUB import.** Drag-and-drop onto the page and a file
   picker. Files are read in-browser only. No upload, no server.
3. **EPUB → `Document` model.** Unzip in-browser, resolve the OPF,
   read spine + manifest + TOC, extract ordered chapters with titles,
   and normalize each chapter body into typed text blocks per the drop
   policy in §4.
4. **Graceful format handling.** AO3-style exports (EPUB2/NCX,
   metadata/notes front matter) and Standard Ebooks / Gutenberg exports
   (EPUB3/nav, boilerplate) both parse into ordered, correctly-titled
   chapters. A malformed EPUB produces a designed error state, never a
   crash or blank screen.
5. **Import report.** The parser records what it kept and dropped
   (images, notes, boilerplate) and the UI can show it.
6. **Structural view.** Once a book loads, show its parsed structure:
   title, author, chapter list with titles, per-chapter block counts,
   and the import report. This is honest raw structure, not a typeset
   preview.
7. **Bundled public-domain sample.** A committed, redistributable
   public-domain EPUB that loads and renders as parsed structure with
   zero user input, in one tap.
8. **Designed empty, loading, and error states** on the import surface.
9. **Staging deploy scaffold.** `Dockerfile` (build static assets, serve
   them) and `docker-compose.staging.yml`. `SENTRY_DSN`,
   `UMAMI_WEBSITE_ID`, `UMAMI_URL` wired via **runtime** env (not baked
   at build). `.env.example` with placeholders only.
10. **README skeleton for strangers** (understand / run / contribute).

### Out of scope (Non-Goals — building any is a defect)
- **Any preview typography or dials** (facing pages, margins, fonts,
  headers, folios, trim size, paper-budget slider). EPIC 3/4/5.
- **The pagination engine / Web Worker measurement.** EPIC 2.
- **Any server-side processing, upload, account, or persistence.**
  Project files and house-style presets are EPIC 7. This EPIC keeps the
  `Document` in memory only.
- **Non-EPUB inputs** (PDF, DOCX, MOBI).
- **Export / PDF generation.** EPIC 6.
- **Guided first-run walkthrough from drop to export.** EPIC 7. (The
  empty state here still meets QUALITY BAR §4 for the surface that
  exists: see §7.)
- **Any runtime LLM.** The product has no text-generation feature.
- **Rendering inline images or covers into the book.** Images are
  recorded, not displayed in the structure view.

---

## 2. Technical design

### 2.1 Stack and dependencies
- **Build/dev:** Vite, React 18, TypeScript (strict).
- **Test:** Vitest + @testing-library/react + jsdom.
- **Lint/format:** ESLint (typescript-eslint) + Prettier.
- **Unzip:** `fflate` (small, fast, synchronous unzip of in-memory
  bytes). Do not add a full EPUB library; we parse the OPF/TOC ourselves
  with the platform `DOMParser`.
- **XML/XHTML parsing:** native `DOMParser` (`application/xml` for
  OPF/NCX, `application/xhtml+xml` with a `text/html` fallback for
  chapter bodies). No XML dependency.
- **Error tracking:** `@sentry/react`, initialized only when a DSN is
  present at runtime.
- **Analytics:** Umami loaded as a script when its runtime config is
  present. No SDK dependency.

Keep the dependency list this short. Adding speculative libraries is
drift.

### 2.2 File / module layout
```
index.html
package.json  tsconfig.json  vite.config.ts  vitest.config.ts
.eslintrc.cjs  .prettierrc  .env.example
src/
  main.tsx                     app entry
  App.tsx                      state machine: empty | loading | ready | error
  config/runtimeConfig.ts      reads window.__BINDERY_CONFIG__ (see 2.6)
  integrations/sentry.ts       init(dsn?) with PII scrubbing; no-op if absent
  integrations/umami.ts        inject(url?, websiteId?); no-op if absent
  model/
    document.ts                Document, Chapter, Block, BlockType types
    importReport.ts            ImportReport types + aggregation helpers
  epub/
    parseEpub.ts               orchestrator: bytes -> { document, report }
    unzip.ts                   fflate wrapper -> Map<path, Uint8Array>
    container.ts               META-INF/container.xml -> OPF path
    opf.ts                     OPF -> { metadata, manifest, spine }
    toc.ts                     nav.xhtml (EPUB3) or NCX (EPUB2) -> TocEntry[]
    chapters.ts               merge spine + TOC -> ordered chapters
    xhtml.ts                   chapter XHTML -> Block[] + drop records (see 4)
    errors.ts                  ParseError (typed, user-safe messages)
  ui/
    ImportSurface.tsx          dropzone + picker; owns drag/drop + file read
    EmptyState.tsx
    LoadingState.tsx           layout-stable skeleton
    ErrorState.tsx             product-voice message + recovery actions
    StructureView.tsx          parsed structure + import report
  sample/loadSample.ts         fetch bundled sample asset -> bytes -> parse
public/
  sample/<public-domain-book>.epub
  config.js                    dev placeholder (empty config); prod generated
docker/
  entrypoint.sh                envsubst -> /usr/share/nginx/html/config.js
  config.js.template
  nginx.conf
Dockerfile
docker-compose.staging.yml
test/fixtures/                 synthetic EPUBs (see 6.1)
README.md
```

### 2.3 Data model (in-memory TypeScript; no persistence, no migrations)
This EPIC introduces no database and no on-disk format, so there are no
migrations. The model is the in-memory contract EPIC 2+ consume. Match
the plan's data-model sketch.

```ts
// model/document.ts
export type BlockType = 'heading' | 'paragraph' | 'image' | 'note';
export type KeptOrDropped = 'kept' | 'dropped';

export interface Block {
  type: BlockType;
  keptOrDropped: KeptOrDropped;
  level?: number;      // heading level 1..6
  text?: string;       // normalized plain text (heading, paragraph, note)
  src?: string;        // image href resolved relative to the chapter doc
  alt?: string;        // image alt text if present
  dropReason?: string; // why a block was dropped (image | note | boilerplate)
}

export interface Chapter {
  id: string;          // stable within the document (spine idref or path)
  title: string;       // from TOC, else first heading, else fallback
  order: number;       // 0-based reading order
  blocks: Block[];     // flat, in reading order; kept + recorded-dropped
}

export interface Document {
  title: string;
  author: string;      // joined creators; empty string if none
  language: string;    // BCP-47 from OPF metadata; '' if absent
  chapters: Chapter[]; // ordered by spine
  source: { name: string; byteLength: number }; // no bytes retained
}
```

`Document` must not retain the raw ZIP, the unzipped file map, or any DOM
nodes after parsing. `parseEpub` returns a fully-materialized value and
lets everything else be garbage-collected.

```ts
// model/importReport.ts
export interface DropRecord {
  chapterOrder: number;
  chapterTitle: string;
  kind: 'image' | 'note' | 'boilerplate';
  reason: string;
  detail?: string;     // e.g. image src, note heading; never full body text
}
export interface ImportReport {
  keptCounts: { headings: number; paragraphs: number; notes: number };
  droppedCounts: { images: number; notes: number; boilerplate: number };
  records: DropRecord[]; // capped list for display; counts are authoritative
}
```

### 2.4 EPUB parse pipeline (`parseEpub(bytes, sourceName)`)
1. **Unzip** bytes with fflate into `Map<path, Uint8Array>`. A ZIP that
   fails to inflate throws `ParseError('not-a-zip')`.
2. **Container** — read `META-INF/container.xml`, resolve the first
   `rootfile` `full-path` to the OPF. Missing/invalid throws
   `ParseError('no-opf')`.
3. **OPF** — parse metadata (`dc:title`, `dc:creator`(s), `dc:language`),
   the `manifest` (id → href, media-type, `properties`), and the ordered
   `spine` (`itemref` → manifest id, honoring `linear="no"` by still
   including it after linear items but flagged, and skipping the nav doc
   itself from reading order). Missing spine throws
   `ParseError('empty-spine')`.
4. **TOC** — EPUB3: the manifest item with `properties="nav"`; parse its
   `nav[epub:type="toc"] ol` into ordered `{ title, href }`. EPUB2:
   the spine `toc` NCX; parse `navMap/navPoint` (respect `playOrder`)
   into `{ title, href }`. Absent/unparseable TOC is not fatal: fall
   back to spine order with derived titles.
5. **Chapters** (`chapters.ts`) — iterate spine documents in order. For
   each, resolve its title: TOC entry whose href points into this
   document (prefer the first), else the document's first `h1..h6`
   text, else `Chapter {n}` where n is 1-based reading order. Parse the
   body with `xhtml.ts` into blocks. Assign `order`.
6. **Assemble** `Document` + aggregate `ImportReport`. Never throw for a
   single bad chapter: a chapter that fails to parse yields an empty
   `blocks` array plus a `boilerplate`/parse `DropRecord`, and parsing
   continues. Only whole-archive structural failures (steps 1–3) throw.

Enforce an input size cap before unzip (default 64 MB, a named constant).
Over-cap throws `ParseError('too-large')`. This is the boundary
validation required by QUALITY BAR §5 for a no-server app.

### 2.5 Sentry + Umami (runtime env, PII-safe)
- **`integrations/sentry.ts`:** `initSentry(cfg)`. If `cfg.sentryDsn` is
  falsy, do nothing. When present, init `@sentry/react` with
  `sendDefaultPii: false` and a `beforeSend` that strips anything
  file-derived: never send the file name, book title, author, or chapter
  text. Breadcrumbs must not capture file contents. This is the "no PII
  in logs" clause and the privacy norm, enforced in code.
- **`integrations/umami.ts`:** `initUmami(cfg)`. If either `umamiUrl` or
  `umamiWebsiteId` is falsy, do nothing. When present, inject the Umami
  script with `data-website-id`. Track page load only. Do **not** send
  any event carrying file name, title, or content.
- Both are called once from `main.tsx` using `runtimeConfig`.

### 2.6 Runtime configuration (no secrets baked at build)
The SPA must read `SENTRY_DSN` / `UMAMI_URL` / `UMAMI_WEBSITE_ID` at
**deploy time**, not build time, so one built image works across
environments and no secret ever enters the bundle or git.

- `index.html` loads `/config.js` **before** the app bundle.
- `config.js` sets `window.__BINDERY_CONFIG__ = { sentryDsn, umamiUrl,
  umamiWebsiteId }`. The committed `public/config.js` sets all empty
  (local/dev = integrations off).
- In the container, `docker/entrypoint.sh` renders
  `docker/config.js.template` with `envsubst` from the environment into
  the served `config.js` at startup, then starts nginx. Unset vars
  render as empty strings, leaving that integration off.
- `runtimeConfig.ts` reads `window.__BINDERY_CONFIG__` defensively
  (missing object → all-empty config).

### 2.7 Dockerfile / compose
- **Dockerfile:** multi-stage. Stage 1 (node) runs `npm ci` and
  `npm run build`. Stage 2 (nginx:alpine) copies `dist/` to
  `/usr/share/nginx/html`, adds `docker/nginx.conf` (SPA fallback to
  `index.html`, correct `application/epub+zip` type for the sample),
  `config.js.template`, and `entrypoint.sh` as the entrypoint.
- **docker-compose.staging.yml:** one service building this Dockerfile,
  mapping a port, and passing `SENTRY_DSN`, `UMAMI_WEBSITE_ID`,
  `UMAMI_URL` from the environment (compose `environment:` referencing
  host env; no values committed). `env_file: .env` optional and
  gitignored.
- `nginx.conf` must serve the bundled sample EPUB and must not add any
  upload or proxy path.

---

## 3. Chapter detection details (correctness targets)

- **Standard Ebooks / Gutenberg (EPUB3, nav):** titles come from
  `nav.xhtml` toc. Standard Ebooks use semantic sections and clean
  headings; Gutenberg varies. When a single spine document holds several
  TOC targets (Gutenberg often puts several chapters in one file), still
  produce one chapter per spine document in this EPIC and title it from
  the first TOC entry pointing into it or its first heading. (Splitting a
  file at internal anchors is not required for EPIC 1 and is not a
  Non-Goal to add later; do the simple, correct thing now.)
- **AO3 (EPUB2, NCX):** AO3 exports carry a title page and a
  preface/"work" page (tags, summary, notes) before the story, and each
  chapter as its own spine document, often titled by an `h2`/`h3`. NCX
  navMap lists them. The preface/metadata page and AO3 tag/summary dump
  are boilerplate (see §4). Chapter titles come from the navMap.
- **Fallback order for a title:** TOC entry → first `h1..h6` in the
  document → `Chapter {n}`.
- **Ordering is always spine order.** The TOC supplies titles, never
  reorders reading order.

---

## 4. Image and author-note policy (documented, testable)

The parser keeps all story-relevant **text**, drops non-story clutter and
images from the reading flow, and records everything droppable. Every
block that is dropped is still represented in the model with
`keptOrDropped: 'dropped'` and a `dropReason`, and counted in the report.

| Content | Policy | In model | In report |
|---|---|---|---|
| Headings (`h1`–`h6`) | Keep | `heading` block, kept, `level` | keptCounts.headings |
| Paragraphs (`p`, and text in `div` leaves) | Keep | `paragraph` block, kept | keptCounts.paragraphs |
| Author / story notes (AO3 chapter notes, prefaces marked as notes, `aside`, endnotes) | **Keep**, typed as note so a later dial can toggle them | `note` block, kept | keptCounts.notes |
| Inline images (`img`, `svg image`, figures) | **Drop from flow, record** | `image` block, dropped, `src`+`alt` retained | droppedCounts.images |
| Boilerplate (Gutenberg license header/footer and transcriber notes; AO3 tag/summary/metadata page; nav/toc documents; colophon; cover page) | **Drop, record** | `note` block, dropped, `dropReason` | droppedCounts.boilerplate |

Rationale: v1 typesets story text into signatures, so images cannot flow
and are recorded rather than shown; story notes are part of what fans
bind, so they are kept but distinctly typed; pure metadata and license
boilerplate is noise and is dropped with a record. Inline formatting
(`em`, `strong`, `a`) is flattened to plain text in this EPIC (the model
carries `text`, not rich runs). `dropReason`/`detail` must never contain
full chapter body text (PII/privacy): use short labels like the image
`src` or a note heading.

Boilerplate detection is heuristic and must be conservative (never drop a
real story chapter): match Gutenberg license markers (e.g. "PROJECT
GUTENBERG", license boundary phrases), AO3 metadata containers, and
documents whose manifest/nav role is cover/toc/colophon. When unsure,
**keep** and do not record. Document the exact heuristics in code
comments so the reviewer can check them.

---

## 5. Ordered task list (each maps to acceptance criteria)

### T1 — Scaffold and tooling
Set up Vite + React + TS (strict), ESLint, Prettier, Vitest. Scripts:
`dev`, `build`, `preview`, `lint`, `typecheck`, `test`.
**AC:** `npm run lint`, `npm run typecheck`, `npm run test`, and
`npm run build` all pass on a clean checkout. `npm run build` emits a
static `dist/`.

### T2 — Model + parser core
Implement `model/*`, `epub/unzip.ts`, `container.ts`, `opf.ts`. Produce a
`Document` skeleton (title/author/language/chapters-by-spine, empty
blocks). Typed `ParseError`s for the whole-archive failure cases.
**AC:** Given a valid fixture, returns a `Document` with correct
title/author/language and spine-ordered chapters. Given a corrupt ZIP,
missing OPF, or empty spine, throws the matching typed `ParseError`.

### T3 — TOC + chapter titling
Implement `toc.ts` (nav + NCX) and `chapters.ts` merge with the §3
fallback order.
**AC:** AO3-style (NCX) and Standard-Ebooks/Gutenberg-style (nav)
fixtures each yield ordered chapters with the expected titles. A fixture
with no usable TOC falls back to first-heading / `Chapter N` titles.

### T4 — XHTML normalization + drop policy
Implement `xhtml.ts` per §4: blocks, kept/dropped classification, image
and boilerplate recording, whitespace normalization, formatting
flattening. Aggregate the `ImportReport` in `parseEpub.ts`.
**AC:** For the fixtures, kept/dropped counts and per-record `kind`
match expected values. A chapter that fails to parse yields empty blocks
plus a record and does not abort the whole parse. No `dropReason`/`detail`
contains full body text.

### T5 — Import surface + states
Implement `ImportSurface` (drag-and-drop + file picker, reads the file to
bytes in-browser, size-cap validation), and `EmptyState`,
`LoadingState`, `ErrorState`. Wire the `App` state machine
(empty → loading → ready | error). No network in this path.
**AC:** Dropping or picking a valid EPUB shows a layout-stable loading
state, then the structure view. A malformed EPUB shows the designed
error state (product voice, recovery actions), never a crash or blank
screen. Over-cap and non-EPUB files show the error state with a clear
message. Fully usable at 390px, no horizontal scroll, ~44px targets,
labeled inputs, visible focus, keyboard reaches every control.

### T6 — Structure view + report
Implement `StructureView`: title, author, chapter count, chapter list
with titles and per-chapter kept-block counts, and a readable import
report (kept/dropped totals, expandable record list).
**AC:** After a successful parse the view shows correct title/author,
the ordered chapter titles, and kept/dropped counts consistent with the
parser output.

### T7 — Bundled sample, one-tap load
Commit a redistributable public-domain EPUB under `public/sample/`.
Implement `sample/loadSample.ts` (fetch the bundled asset → bytes →
`parseEpub`). Add a prominent one-tap "Open the sample book" action on
the empty state. Credit the source + license in the README.
**AC:** With no user file, one tap loads the sample and renders its
parsed structure in well under a minute. The sample is genuinely public
domain and redistributable.

### T8 — Sentry + Umami + runtime config
Implement `runtimeConfig.ts`, `integrations/sentry.ts`,
`integrations/umami.ts`, `public/config.js` (empty), and call them from
`main.tsx`. Both integrations no-op when their config is absent and are
PII-safe when present.
**AC:** With config absent, no Sentry/Umami network calls occur and the
app works. With config present (unit-tested via injected
`window.__BINDERY_CONFIG__`), init is invoked with the right values and
`beforeSend` scrubs file-derived fields. No DSN/website id in any tracked
file.

### T9 — Staging deploy scaffold
Write the multi-stage `Dockerfile`, `docker/entrypoint.sh` (envsubst →
`config.js`), `docker/config.js.template`, `docker/nginx.conf`,
`docker-compose.staging.yml`, and `.env.example` (placeholders only).
**AC:** `docker compose -f docker-compose.staging.yml up` builds and
serves the static app; opening it and tapping the sample renders the
parsed structure within a minute with no user file. `config.js` is
generated from env at container start; unset vars leave integrations off.

### T10 — README skeleton + privacy verification notes
Write the stranger-facing `README.md` (what it is in 2–3 plain
sentences; exact clone/build/run commands verified against the compose
file; how to run tests; where the code lives; sample credit/license). No
factory/pipeline internals.
**AC:** A stranger can understand, run (commands match the real compose
file and scripts), and contribute. README documents the "your file never
leaves the browser" property and how to verify it (devtools network tab
+ offline).

---

## 6. Test plan (which automated test proves each criterion)

### 6.1 Fixtures (committed under `test/fixtures/`)
Build small **synthetic** EPUBs in code or as committed files (these are
test assets, distinct from the shipped sample):
- `ao3-style.epub` — EPUB2 with `toc.ncx`, a preface/metadata page, an
  inline image, a chapter notes section, and 3 chapters with `h2`
  titles.
- `standard-ebooks-style.epub` — EPUB3 with `nav.xhtml`, semantic
  sections, a colophon, and 3 chapters.
- `no-toc.epub` — valid spine, no nav/NCX (tests title fallback).
- `malformed.epub` — bytes that are not a valid ZIP, plus a second
  variant with a valid ZIP but missing OPF (tests both throw paths).
Each fixture ships with an expected-model JSON the tests assert against.

### 6.2 Unit / integration tests (Vitest)
| Criterion | Test |
|---|---|
| Ordered chapters + correct titles (AO3 + Standard/Gutenberg) | `parseEpub` on both fixtures deep-equals expected chapter `order`+`title` arrays |
| No usable TOC | `no-toc.epub` yields first-heading / `Chapter N` titles |
| Malformed → typed error, no crash | corrupt-ZIP and missing-OPF fixtures each throw the matching `ParseError`; `ErrorState` renders it (component test) with no thrown render |
| Image/note policy + report | kept/dropped counts and per-record `kind` for both style fixtures match expected; assert no `dropReason`/`detail` contains body text |
| Single bad chapter is contained | fixture with one unparseable chapter still returns a `Document`; that chapter has empty blocks + a record |
| Size cap / non-EPUB rejected | oversized and non-zip inputs throw and surface the error state |
| No network carries file content | spy/mimic `fetch`/`XMLHttpRequest`/`navigator.sendBeacon`; run a full import and assert none is called with file bytes (parser is pure over bytes; import controller uses no network) |
| Integrations gated + PII-safe | with empty config, `initSentry`/`initUmami` make no calls; with injected config, they init with expected args and `beforeSend` drops file name/title/text |
| Empty / loading / error states | component tests assert each state renders its designed content (copy, actions, layout-stable skeleton) and is reachable via the `App` state machine |
| Structure view correctness | given a parsed `Document`, view shows title/author, ordered titles, and matching kept/dropped counts |
| A11y basics | tests assert labeled inputs, a focusable primary action, and heading structure on the import + structure surfaces |

### 6.3 Manual / documented verification (implementer runs; record in result)
These cannot run in the unit test runner but are part of DONE:
1. **Docker serve + sample:** build the image, `docker compose -f
   docker-compose.staging.yml up`, open the app, tap the sample, confirm
   parsed structure appears within a minute with no user file.
2. **Privacy / offline:** open devtools network tab, import a real EPUB,
   confirm zero requests carry file bytes; then set devtools to offline
   and confirm import + parse still work on an already-loaded tab.
3. **Runtime config:** run the container with and without `SENTRY_DSN`/
   `UMAMI_*` set; confirm `config.js` reflects env and integrations turn
   on/off accordingly; confirm no secret is present in `dist/` or git.
4. **390px pass:** at a 390px viewport, confirm every control is
   reachable, no horizontal scroll, comfortable tap targets, readable
   text.

Record measurements/results for §6.3 in `result.json` `summary` and, if
useful, a short report artifact.

---

## 7. QUALITY BAR mapping (binding, budget from the start)

- **§1 Perceived speed:** first meaningful render is the empty state with
  real content (dropzone + sample), not a blank page. The import shows a
  layout-stable loading state immediately; parsing does not present a
  frozen white screen. No unindexed hot-path queries exist (no server);
  the structure view lists chapters (bounded by book size) and must not
  render every block of a 300k-word book eagerly in a way that janks
  (render chapter summaries + counts, expand on demand).
- **§2 Mobile-first:** the import surface and structure view are fully
  usable at 390px. Single-column; ~44px targets; no horizontal scroll.
- **§3 Designed states:** empty, loading (skeleton), and error are
  designed surfaces here, and each is tested (§6.2).
- **§4 First-run:** a brand-new user landing on the empty state
  understands what the product does (turn an EPUB into a printable book)
  and reaches the core action available at this stage in one tap: open a
  book, with the bundled sample bridging the "no file handy" gap and
  producing real parsed output. The full guided drop-to-export
  walkthrough is EPIC 7 and is explicitly out of scope here; do not build
  a partial walkthrough. This EPIC satisfies §4 for the surface that
  exists (understand + reach the core action + working example).
- **§5 Security hygiene:** no server, so authz/rate-limit are N/A by
  construction; boundary validation happens at the parse boundary (file
  type, size cap, structure); React handles output encoding; Sentry
  scrubs PII and no file-derived data is logged; secrets via runtime env
  only.
- **§6 Accessibility:** labeled inputs, visible focus, semantic headings
  and landmarks, meaningful alt handled (images are recorded with alt,
  not shown), keyboard reaches every control.
- **§7 Radically simple interface:** the empty state has ONE obvious
  primary action (choose an EPUB) with the sample as a visibly
  subordinate secondary action. No walls of text.
- **§8 Copy that sounds human:** all visible strings are positive and
  plain, with no em-dashes, no banned vocabulary, and no negative
  empty-state phrasing. Sweep before done. Reference copy below is
  already swept; ship it or better.
- **§9 README:** stranger-facing, verified run commands, no pipeline
  jargon.

### Reference copy (already swept; use or improve)
- Empty state heading: **Open a book to begin**
- Empty state body: **Drop an EPUB here or choose a file. Your book stays
  on your computer.**
- Primary action: **Choose EPUB file**
- Secondary action: **Open the sample book**
- Loading: **Reading your book**  (with a layout-stable skeleton)
- Error (unreadable file): heading **This file is not a readable EPUB.**
  body **Choose a valid .epub and try again.** actions **Try another
  file** / **Open the sample book**
- Error (too large): **This file is larger than the {N} MB limit. Choose
  a smaller EPUB.**
- Import report label: **Kept {p} paragraphs and {h} headings. Set aside
  {i} images and {b} extra sections.**  (Use "Set aside", not negative
  phrasing; show the detail list on expand.)

Sweep note: reject the characters "—" and "–", the words "seamlessly /
effortlessly / unlock / elevate / empower / leverage / robust / dive in",
and negative openers ("You don't have", "No … yet", "Nothing here",
"Unable to", "Something went wrong") in every shipped string.

---

## 8. Definition of done
- All ten tasks' ACs met; every planner acceptance criterion below maps
  to a passing test or a recorded §6.3 verification.
- `lint`, `typecheck`, `test`, `build` green.
- Docker staging serves the app and the sample renders with no user file.
- No secret in any tracked file; `.env.example` placeholders only.
- Copy swept; states designed and tested; 390px verified.

### Planner AC → coverage
1. *Docker serves; sample renders within a minute, no user file* → T7,
   T9; §6.3(1).
2. *AO3 + Standard/Gutenberg parse to ordered correct-title chapters;
   malformed shows designed error, no crash/blank* → T2, T3, T5; §6.2
   rows 1–3.
3. *Images and author notes handled per documented policy; app records
   and can report kept/dropped* → §4, T4, T6; §6.2 row 4.
4. *No network request carries file content; offline after first load* →
   T5, T8; §6.2 network row; §6.3(2).
5. *Error tracking + analytics init from env; no secrets in tracked
   files* → T8, T9; §6.2 integrations row; §6.3(3).
