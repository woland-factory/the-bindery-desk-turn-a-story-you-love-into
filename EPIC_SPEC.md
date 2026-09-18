# EPIC SPEC — Dual export: typeset PDF and imposed signatures

> EPIC 6 of The Bindery Desk. EPIC 2 built the streamed pagination engine,
> EPIC 3 the facing-page preview, EPIC 4 the typography dials with live
> whole-book re-flow, EPIC 5 the paper-budget slider and its solver. This
> EPIC turns the book on screen into two files a binder can print: a
> **typeset PDF** that reproduces the preview page for page with the font
> embedded, and a **printer-ready signature PDF** whose sheets fold into
> reading order. Both are built entirely in the browser, off the main
> thread, with visible progress, from one Export click.
>
> This EPIC adds NO new typography or budget controls, NO cover or
> dust-jacket export, NO output format other than PDF, NO cloud storage or
> upload of any kind, and NO server. It changes neither `DEFAULT_DESIGN`,
> the dial set, the EPUB parser, nor the pagination engine's output shape.
> Everything runs in the browser: the main thread plus a new dedicated
> export worker, alongside the existing pagination worker.

---

## Quality differentiator (this product must win here)

**Live responsiveness of the whole-book re-flow.** Any control, above all
the paper-budget slider, re-flows the entire book with perceptible feedback
under 100ms and a settled result within about two seconds on a 300k-word
novel. We make control immediate and reversible in a way no free path
(Word, Calibre, Reedsy) offers.

**What it demands of THIS EPIC:** export is not the re-flow, but it must
protect the trust the re-flow earns. Two things follow:

- **The file is exactly the book on screen.** The typeset PDF has the same
  page count and the same page geometry as the preview for the same
  settings, built from the same `PaginationResult`. A binder who prints
  forty sheets without a test page must get the book they were looking at.
- **Export never freezes the surface.** A 300k-word book is roughly 900
  pages. Building two PDFs from it must run in a worker with streamed
  progress, so the studio stays interactive and the paper-budget slider the
  differentiator lives on never stalls behind an export. A frozen tab during
  export would break the exact promise EPIC 5 made.

Export fidelity and a live surface are both in scope from the start.

---

## 1. Scope

### In scope
1. **Typeset PDF.** One PDF page per `Page` in the current settled
   `PaginationResult`, at the design's trim size, reproducing the preview:
   mirrored inner/outer margins, running header and folio on body pages,
   the engine's laid-out lines in the text area, blank pages where the
   engine inserted them. The book's face is embedded (subset) so the file
   renders on a machine that lacks the font.
2. **Imposition math.** A pure, deterministic function that maps a page
   count to a sheet-by-sheet plan folding into reading order, with
   **configurable sheets-per-signature** and a **duplex flip** option
   (long edge default, short edge). Verified against hand-computed 8-page
   and 16-page saddle-stitch orderings and a physical fold of the sample.
3. **Signature PDF.** One PDF page per printed sheet side, at the folded
   sheet size (two trim pages wide by one trim page tall), placing two
   typeset pages per side per the imposition plan, with the correct
   rotation for the chosen flip. The last signature is padded with blank
   pages to a whole number of sheets.
4. **One-click dual export with progress.** A single Export action builds
   both PDFs in the export worker, streams progress to the studio, and
   saves both files. The main thread stays interactive throughout; the
   300k-word book completes without an out-of-memory failure.
5. **A small print-setup surface.** Sheets-per-signature and duplex flip,
   in one disclosure beside the Export button. Sensible defaults, so a
   first-time binder never has to open it.
6. **First-run reach.** Export works on the bundled sample with no user
   file: open the sample, click Export, get two valid PDFs. Proven in e2e.
7. **No upload, ever.** Both PDFs are built from bytes already in the tab.
   The book file is never sent anywhere. Proven with the network tab.
8. **Mobile-first, accessible, swept.** The Export control and print-setup
   inputs are usable at 390px with ~44px targets and no horizontal scroll;
   every input labeled; progress announced politely; all copy swept.

### Out of scope (Non-Goals — building any is a defect)
- **Cover or dust-jacket export.** No cover surface, no spine width, no
  paper-thickness input of any kind.
- **Any output format other than PDF.** No PNG, no per-page images, no
  print-CSS path, no EPUB re-export.
- **Cloud storage of exports.** No account, no server, no remote save, no
  share link. Files are saved locally by the browser.
- **New typography or budget controls.** The print-setup inputs configure
  imposition only; they never change the design or trigger a re-flow. Do
  not add a design dial or a new budget lever.
- **Changing the engine's output shape.** `PaginationResult`, `Page`,
  `Line`, and `DesignSpec` are unchanged. Export consumes the settled
  result read-only; it does not add fields to any engine message.
- **Re-flowing or re-paginating to export.** Export uses the result the
  preview already settled on; it does not run a second layout pass with
  different rules.
- **Editing the story, re-parsing, or touching the EPUB parser or
  `Document` model.**
- **Any runtime LLM, any network path beyond same-origin app assets.**

---

## 2. Technical design

### 2.1 What already exists (consume; change only where named)
- `src/engine/types.ts` — `DesignSpec`, `Page`, `Line`, `PaginationResult`.
  **Unchanged.** Export reads `result.pages` and each `Line`'s `x/y/width`.
- `src/ui/pageGeometry.ts` — `pagePlacement(design, side)` returns the full
  physical page box and text placement in CSS px (mirrored per side, folio
  edge, chrome baseline). **Unchanged**; the PDF builder places every page
  from exactly these numbers, so the file matches the preview by
  construction.
- `src/engine/units.ts` — `PX_PER_PT = 96/72`, `PX_PER_IN`, `lengthToPx`,
  `ptToPx`. **Unchanged**; the builder converts CSS px to PDF points by
  dividing by `PX_PER_PT` (`pt = px / PX_PER_PT`).
- `src/ui/runningHead.ts` — `resolveRunningHead(template, ctx)`.
  **Unchanged**; the builder resolves headers with the same function and
  the same `{title, author, chapter}` context `PageView` uses.
- `src/ui/PageView.tsx` — the on-screen leaf. Its soft-hyphen display rule
  (`displayText`: strip `SOFT_HYPHEN`, append a visible hyphen when
  `line.hyphenated`) is the single source of truth for rendered line text.
  **Extract** that rule into a shared pure helper (§2.3) so the PDF and the
  preview render byte-identical strings; `PageView` then calls the helper.
- `src/engine/budget.ts` — `PAGES_PER_SHEET` (4), `SHEETS_PER_SIGNATURE`
  (4), `sheetsForPages`. **Unchanged**; imposition reuses these constants
  so a "signature" means the same thing the slider readout already states.
- `src/fonts/catalog.ts` — `FONT_CATALOG`, `entryForStack`, `FontEntry`.
  **Gains** an `embed` field per embeddable entry (§2.4): the URLs of the
  TTF/OTF used for embedding. On-screen woff2 rendering is untouched.
- `src/ui/ControlPanel.tsx` — holds the disabled Export placeholder and its
  hint. **Gains** a live Export button, its progress/idle/error states, and
  the print-setup disclosure, wired through props (§2.8).
- `src/ui/BookPreview.tsx` — owns the engine and the settled
  `PaginationResult` in `state.result`. **Gains** an `exportRequest` prop
  and `onExportState` callback, and an effect that drives the export
  controller from `state.result` (§2.7), mirroring the existing `budget`
  prop pattern exactly.
- `src/ui/Studio.tsx` — owns the working design and orchestrates the budget
  request. **Gains** export request state and the print-setup options
  (§2.8).

### 2.2 New dependencies
Two runtime dependencies, both pure-JS and browser-safe, no DOM, no
network of their own:
- `pdf-lib` (^1.17.1) — PDF construction, page embedding, save to bytes.
- `@pdf-lib/fontkit` (^1.1.1) — font subsetting for `embedFont(bytes,
  { subset: true })`.
Both run inside the export worker. No other library (no state manager, no
imposition library) is added; the imposition is a few dozen lines of pure
arithmetic (MIT prior art: bookbinder-js).

### 2.3 New file / module layout
```
src/export/
  geometry.ts        pure px->pt helpers and the per-line baseline model
                     (pxToPt(px), pagePointBox(design, side) from
                     pagePlacement, lineBaselinePt(placement, line, ascent)).
  geometry.test.ts
  lineText.ts        the shared soft-hyphen display rule extracted from
                     PageView (displayLineText(line): string).
  lineText.test.ts
  impose.ts          pure, no pdf-lib: ImpositionOptions,
                     DEFAULT_IMPOSITION, imposeBook(pageCount, options):
                     ImpositionPlan (§2.6). Deterministic arithmetic only.
  impose.test.ts
  fonts.ts           map a DesignSpec to the face to embed and its byte
                     URLs (reuse entryForStack + the new catalog.embed);
                     the system serif maps to a designated embeddable
                     fallback serif so export always embeds a real face.
  fonts.test.ts
  pdf.ts             the builders that run in the worker:
                       buildTypeset(result, design, docMeta, fontBytes, onProgress): Uint8Array
                       buildSignatures(typesetDoc, plan, design, flip, onProgress): Uint8Array
                     buildSignatures embeds typeset pages as shared XObjects
                     (pdf-lib embedPages), never re-drawing text.
  export.worker.ts   worker entry: receive an ExportRequest, fetch font
                     bytes same-origin, run both builders with progress,
                     transfer both ArrayBuffers back. No DOM.
  protocol.ts        ExportRequest / ExportProgress / ExportDone / ExportError.
  client.ts          main-thread ExportClient: post the request, forward
                     progress, resolve with both byte arrays; latest-wins
                     cancel on a new request; disposes the worker.
  download.ts        main-thread save: bytes -> Blob -> object URL ->
                     anchor click; filenameSlug(title, suffix).
  download.test.ts
src/fonts/catalog.ts           + embed URLs on embeddable entries
src/ui/PageView.tsx            call displayLineText (behavior unchanged)
src/ui/ControlPanel.tsx        live Export button + print-setup disclosure
src/ui/BookPreview.tsx         + exportRequest prop, onExportState, effect
src/ui/Studio.tsx              + export request state, print-setup options
src/styles.css                 Export progress, print-setup disclosure
public/fonts/embed/            <id>-400 and <id>-700 TTF/OTF for the four
                               OFL faces (lazy; export-only)
public/fonts/PROVENANCE.md     record the embed files' sources/versions
e2e/export.spec.ts             sample export, 300k progress, no-upload, 390px
```

### 2.4 Font embedding (the "renders without the font" guarantee)
The on-screen faces are woff2, which the subsetting path does not consume
reliably. Export embeds from a TTF/OTF of the **same upstream release** as
the woff2 (same family and version, so glyph metrics match the measured
layout). These files live under `public/fonts/embed/` and are fetched by
the worker only when an export runs, so the initial bundle is untouched.

- `catalog.ts` gains `embed?: { regular: string; bold: string }` on each
  embeddable entry, pointing at those files. `FontEntry.weights` (woff2,
  on-screen) is unchanged.
- `export/fonts.ts` resolves the face for a design via `entryForStack`.
  For the four OFL faces it returns their `embed` URLs. For the **system
  serif** (no file, cannot embed the OS Georgia) it returns a designated
  bundled fallback serif's `embed` URLs, so export always embeds a real,
  subsettable face and the guarantee is uniform.
- Because the engine's lines are left-aligned and pre-broken (every
  `Line.x` is 0; ragged right, no justification), embedding a face whose
  metrics differ slightly from the measured one can never re-break a line
  or overflow the column beyond a hair. The four OFL faces embed the exact
  measured design and reproduce the preview faithfully; the system-serif
  export substitutes the fallback serif for the OS Georgia and is
  documented as such. This is honest and never changes the page count.
- The worker calls `pdfDoc.registerFontkit(fontkit)` then
  `pdfDoc.embedFont(bytes, { subset: true })` for the regular weight (the
  only weight the preview draws, §2.5), so only the glyphs actually used
  ship in the file. Subsetting is also the primary guard against a bloated
  900-page file. Bundling the bold TTF/OTF is fine for provenance symmetry,
  but this EPIC embeds and draws the regular weight only.

**Provenance.** Add the embed files' sources and versions to
`public/fonts/PROVENANCE.md`; they keep the OFL 1.1 license already in
`public/fonts/OFL.txt`. No new license obligation beyond the existing four.

### 2.5 Typeset PDF geometry (matches the preview by construction)
`buildTypeset` iterates `result.pages` in order and emits one PDF page each.
For a page of `side`:
- **Page box.** `pagePointBox(design, side)` converts `pagePlacement`'s
  `pageWidthPx/pageHeightPx` to points; the PDF page is created at that
  size. Every page uses its own side's placement, so verso/recto mirror.
- **Text area origin.** `textLeftPx`, `textTopPx`, `columnPx`,
  `textHeightPx` from `pagePlacement`, converted to points. PDF's y-origin
  is the page bottom, so a top-referenced offset `oTop` becomes
  `pageHeightPt - oTop`.
- **Lines.** For each `Line`, x = `textLeftPt + pxToPt(line.x)` (0 in this
  engine, left aligned). The baseline is modeled on the CSS line box
  `PageView` renders: a box of height `lineHeightPx` starting at
  `textTopPx + line.y`, font-size `fontSizePx`, text vertically centered by
  line-height. `lineBaselinePt` computes the baseline from the top of that
  box using the embedded font's ascent (via fontkit) and the half-leading
  `(lineHeightPx - fontSizePx)/2`, then flips to PDF's bottom origin. The
  string drawn is `displayLineText(line)` (§2.3). **Weight.** `PageView`
  sets no `font-weight` on any line, header, or folio, so the on-screen leaf
  draws everything at the regular weight (the engine measures heading blocks
  bold, but the preview renders them regular; do not "fix" that here). To
  match the preview, the typeset PDF draws every line, header, and folio in
  the embedded **regular** weight. The bold weight is not needed for
  fidelity in this EPIC; `export/fonts.ts` may resolve regular only.
- **Chrome.** For `kind === "body"`, draw the running head at
  `chromeBaselinePx` (from `pagePlacement`) using
  `resolveRunningHead(template, {title, author, chapter})` with the chapter
  title looked up from `docMeta.chapterTitles[page.chapterIndex]`, and the
  folio (`page.index + 1`) at the `folioEdge`. `kind === "blank"` and
  `kind === "opener"` follow `PageView`'s rules (openers carry no running
  head/folio only if `PageView` omits them; match `PageView`). Blank pages
  draw nothing.
- **`docMeta`** passed from the main thread is small: `{ title, author,
  chapterTitles: Record<number, string> }`, built once from the `Document`.
  No book text beyond chapter titles crosses in metadata; the page text is
  already in `result.pages`.

**Page count equals the preview.** The typeset PDF has exactly
`result.pageCount` pages because it emits one per `Page`. This is the
proof of acceptance criterion 4 and is asserted directly.

### 2.6 Imposition (`src/export/impose.ts`, pure)
```ts
interface ImpositionOptions { sheetsPerSignature: number; flip: "long-edge" | "short-edge" }
const DEFAULT_IMPOSITION = { sheetsPerSignature: SHEETS_PER_SIGNATURE, flip: "long-edge" }

interface PlacedPage { source: number | null; rotation: 0 | 180 } // 1-based page, null = blank
interface SheetSide { left: PlacedPage; right: PlacedPage }        // one printed side
interface ImpositionPlan {
  sides: SheetSide[];        // in print order; even index = front, odd = back
  paddedPageCount: number;   // pageCount rounded up to a whole number of sheets
  signatureCount: number;
}
imposeBook(pageCount: number, options: ImpositionOptions): ImpositionPlan
```

**Padding and signatures.** `PAGES_PER_SHEET = 4`. Round `pageCount` up to
`paddedPageCount`, a multiple of 4. Split into signatures of
`sheetsPerSignature * 4` pages each; the final signature takes the
remainder (still a multiple of 4, so it may hold fewer sheets than
configured). Padding pages (`source > pageCount`) render blank.

**Per-signature saddle-stitch order.** For a signature of `n` pages
(local 1..n, global = signatureStart + local), `sheets = n / 4`, for each
sheet `k` in `0..sheets-1`:
- front side: left = `n - 2k`, right = `1 + 2k`
- back side:  left = `2 + 2k`, right = `n - 1 - 2k`

Emit, per signature, for `k = 0..sheets-1`: the front side then the back
side. Concatenate signatures in order.

**Golden orderings (the automated proof).** A single 8-page signature
(`sheetsPerSignature` large enough to hold it, long edge) yields, as
`[left, right]` per side in print order:
```
front0 [8, 1]   back0 [2, 7]   front1 [6, 3]   back1 [4, 5]
```
A single 16-page signature yields:
```
front0 [16,1]  back0 [2,15]  front1 [14,3]  back1 [4,13]
front2 [12,5]  back2 [6,11]  front3 [10,7]  back3 [8,9]
```
These match the standard saddle-stitch tables and are pinned in
`impose.test.ts`. They are also the reference for the physical fold test
(below): if a physical fold of the sample proves the nesting differs, the
formula and these goldens change together, since the criterion is
"folds into correct reading order," proven physically.

**Duplex flip.** `long-edge` (default): back sides as written, `rotation:
0`. `short-edge`: the printer flips the reverse on the short edge, so each
**back** side is rotated 180 and its two pages swap positions
(`left`/`right` exchanged, both `rotation: 180`). Front sides are never
rotated. A golden test pins the short-edge transform of the 8-page case.

### 2.7 Signature PDF and the worker
`buildSignatures` takes the already-built typeset `PDFDocument`, embeds its
pages once (`embedPages` -> shared XObjects, so page content is never
duplicated in memory), and for each `SheetSide` creates one PDF page at the
folded-sheet size `(2 * trimW) x trimH` in points, landscape. It draws the
`left` page in the left half and the `right` page in the right half at true
trim size, applying each `PlacedPage.rotation`. A `source` past
`pageCount` (padding) or `null` draws nothing (blank). Signature PDF page
count equals `plan.sides.length`.

**Export worker flow (`export.worker.ts`):**
1. Receive `ExportRequest { requestId, result, design, docMeta, imposition }`.
   `result` and `docMeta` cross by structured clone (one-time cost per
   export; the pages are the exact settled result from the preview).
2. Resolve the face (`export/fonts.ts`) and `fetch` its regular-weight
   embed bytes same-origin. On a fetch failure post `ExportError`
   (product-voice).
3. `buildTypeset` with an `onProgress` that posts `ExportProgress
   { phase: "typeset", page, total }` every ~50 pages.
4. `imposeBook(result.pageCount, imposition)`, then `buildSignatures` with
   `onProgress` posting `{ phase: "impose", side, total }` every ~50 sides.
5. Save both docs to bytes and post `ExportDone { requestId, typeset,
   signatures }` transferring both `ArrayBuffer`s. Latest-wins: if a newer
   `requestId` arrived, drop the stale one before posting.

**Main thread never blocks.** All pdf-lib work is in the worker. The main
thread only builds `docMeta`, forwards progress to the UI, and on done
turns two `ArrayBuffer`s into downloads (§2.9). A rAF/interaction check in
e2e proves the surface stays live during a 300k export.

**Memory (no OOM on 300k).** One subset font per doc; typeset pages embedded
as shared XObjects in the signature doc (not redrawn); progress rather than
buffering strings; transfer (not copy) the results back. These bound peak
memory to roughly one typeset doc plus its shared-page signature doc.

### 2.8 Protocol, client, and UI wiring
- **`export/protocol.ts`:**
  ```ts
  interface ExportRequest { requestId: number; result: PaginationResult;
    design: DesignSpec; docMeta: DocMeta; imposition: ImpositionOptions }
  interface ExportProgress { type: "progress"; requestId: number;
    phase: "typeset" | "impose"; done: number; total: number }
  interface ExportDone { type: "done"; requestId: number;
    typeset: ArrayBuffer; signatures: ArrayBuffer }
  interface ExportError { type: "error"; requestId: number; message: string }
  ```
- **`export/client.ts` (`ExportClient`)** creates the worker lazily, posts a
  request with a monotonic `requestId`, forwards progress, resolves the
  active request on done, rejects on error, and ignores stale replies. It
  exposes `export(request, handlers)` and `dispose()`, and a
  `ExportClientLike` interface plus a test fake, matching `engine/client.ts`
  conventions. A timings hook is not required.
- **`BookPreview`** gains:
  ```ts
  exportRequest?: { seq: number; imposition: ImpositionOptions } | null;
  onExportState?: (state: ExportUiState) => void; // idle | { phase, pct } | error | done
  ```
  An effect keyed on `exportRequest?.seq`, active only when
  `state.status === "ready"`, builds `docMeta` from `document`, and calls
  the export controller with `state.result`, `renderDesign`, and the
  request's `imposition`. It forwards progress and, on done, saves both
  files via `download.ts` and reports `done`; on error reports `error`.
  A new seq while one export runs supersedes it (latest-wins in the client).
  Export never mutates preview state, never re-paginates, and never blanks.
- **`Studio`** gains `imposition` (init `DEFAULT_IMPOSITION`, optional
  persist via a small `bindery.print` localStorage key), an `exportSeq`
  bumped on Export click, and passes `exportRequest = { seq, imposition }`
  to `BookPreview`. It receives `onExportState` and forwards it to
  `ControlPanel` for the button's live label. The print-setup edits update
  `imposition` only; they never touch the design or trigger a solve.
- **`ControlPanel`** replaces the disabled Export placeholder with a live
  button that is enabled once the preview has settled at least one page and
  disabled while `exportState.phase` is set; it shows the progress label
  during a run and the error/next-step message on failure. Below it, a
  `<details><summary>Print setup</summary></details>` holds two labeled
  controls: **Sheets per signature** (a select of whole-sheet options,
  default `SHEETS_PER_SIGNATURE`) and **Duplex flip** (Long edge / Short
  edge). Export stays the single primary action in the column.

### 2.9 Download (`src/export/download.ts`)
`saveBytes(bytes, filename)` wraps a `Blob` (`type:
"application/pdf"`), creates an object URL, clicks a transient `<a
download>`, and revokes the URL. On Export done, save the typeset file then
the signature file (a short tick apart so a browser does not suppress the
second), and also surface two visible download links in the status area as
a fallback if the browser blocked an automatic save. `filenameSlug(title,
suffix)` lowercases the book title, keeps `[a-z0-9]`, joins runs with a
single hyphen, falls back to `book` when empty, and appends `-typeset.pdf`
or `-signatures.pdf`. No spaces, no em dash, no en dash in filenames.

### 2.10 Determinism, security, accessibility
- **Determinism.** `impose.ts`, `geometry.ts`, `lineText.ts`, and `pdf.ts`
  are pure over their inputs; no `Date.now`/`Math.random` anywhere in the
  build. The same result, design, and imposition options always produce
  byte-comparable PDFs (page counts, sizes, imposition order stable).
- **Security / no upload.** No server, no new outbound path. The only
  network calls are same-origin GETs for the embed font files (app assets,
  like the existing woff2). The book file's bytes are never in any request.
  No book text or PII in any log, message, or error. Storage access
  (`bindery.print`) is try/caught and degrades silently.
- **Accessibility.** The Export button is a real `<button>` with a visible
  label and `aria-busy` during a run; progress is one polite live region;
  the print-setup controls are labeled native inputs inside a
  `fieldset`/`legend` within the disclosure; focus visible via the existing
  `:focus-visible` rule; keyboard reaches the button, the disclosure
  summary, and every control; targets clear 44px at 390px.

---

## 3. Ordered task list (each maps to acceptance criteria)

### T1 — Pure export math and text (`geometry.ts`, `lineText.ts`, `impose.ts`)
px->pt helpers and the baseline model; the extracted soft-hyphen display
rule (with `PageView` switched to call it, behavior unchanged); the
imposition planner with padding, signature splitting, saddle-stitch order,
and the flip transform.
**AC (Vitest, jsdom-safe):** `pxToPt` and `pagePointBox` invert the CSS-px
geometry correctly; `displayLineText` returns exactly what `PageView`
rendered before (a snapshot over hyphenated and plain lines); `imposeBook`
matches the pinned 8-page and 16-page goldens, pads non-multiples of 4 to
whole sheets, splits into signatures with a possibly-shorter last one, and
applies the short-edge transform (back sides swapped and rotated 180, fronts
untouched); every `PlacedPage.source` is either a valid 1..paddedPageCount
index or null; two identical calls are equal.

### T2 — Font resolution and embedding assets (`fonts.ts`, catalog, assets)
Add `embed` URLs to embeddable catalog entries; add the four faces' TTF/OTF
under `public/fonts/embed/` (same upstream release as the woff2); record
them in `PROVENANCE.md`; `export/fonts.ts` resolves a design to the face to
embed, mapping the system serif to the designated fallback serif.
**AC (Vitest):** `resolveExportFont` returns the matching embed URLs for
each OFL face and the fallback serif's URLs for the system serif; the embed
files exist and are non-empty; on-screen `catalog` lookups and
`loadFontFace` behavior are unchanged (existing font tests pass).

### T3 — PDF builders (`pdf.ts`)
`buildTypeset` (one page per `Page`, mirrored geometry, headers/folios,
embedded subset font, blank pages) and `buildSignatures` (folded-sheet
pages, two embedded typeset pages per side, rotation per plan).
**AC (Vitest, pdf-lib in jsdom, `SyntheticMeasurer`-built results):**
loading the typeset bytes back yields exactly `result.pageCount` pages,
each at the trim size in points for its side; the document carries an
**embedded, subsetted** font (a font descriptor with an embedded FontFile
stream and a subset tag), proving the "renders without the font" criterion;
the signature bytes load to `plan.sides.length` pages at the folded-sheet
size; a small book with a page count not divisible by the signature size
produces trailing blank cells in the last signature and no error; building
never throws on a blank-only or single-page result.

### T4 — Export worker, protocol, client (`export.worker.ts`, `protocol.ts`, `client.ts`, `download.ts`)
Wire the worker to fetch font bytes, run both builders with progress, and
transfer both results; the main-thread client with latest-wins and dispose;
the download helper and filename slug.
**AC (Vitest with a fake worker / mocked fetch):** an export request drives
both phases and resolves with two non-empty byte arrays; progress messages
arrive for both `typeset` and `impose` phases with monotonic `done`; a
newer `requestId` supersedes an in-flight export and the stale done is
dropped; a font fetch failure yields a product-voice `ExportError`;
`filenameSlug` lowercases, hyphenates, strips punctuation, falls back to
`book`, and never emits a space or dash-aside; `saveBytes` builds a
`application/pdf` blob and revokes its URL.

### T5 — Preview and Studio wiring (`BookPreview.tsx`, `Studio.tsx`)
The `exportRequest` effect off `state.result`, `onExportState`, export
request state and print-setup options in Studio, optional persistence.
**AC (Vitest, fake export client):** bumping `exportRequest.seq` calls the
client once with the current `result`, `renderDesign`, and `imposition`;
export does not re-paginate, does not blank the mounted book, and does not
move scroll; progress flows to `onExportState`; on done both files are
saved (the download helper is called twice); on error the error state is
reported; print-setup edits change `imposition` only and never trigger a
paginate or solve; existing `BookPreview`, `Studio`, and `App` suites pass.

### T6 — ControlPanel Export surface and styles (`ControlPanel.tsx`, styles)
Replace the disabled placeholder with a live button and its idle/progress/
error states; the print-setup disclosure with two labeled controls; CSS for
the progress affordance and the disclosure at 390px.
**AC (Vitest + Testing Library):** the button is disabled before the first
settled page and enabled after; clicking it fires the export callback once;
during a run it is `aria-busy` and shows the progress label; the error
state shows the §4 message with a next step; print-setup controls are
labeled, default to `SHEETS_PER_SIGNATURE` and Long edge, and fire their
change callbacks; a copy-sweep test over the component's strings finds no
em/en dash, no banned vocabulary, and no negative phrasing.

### T7 — e2e export harness (`e2e/export.spec.ts`)
Against the production build, Chromium:
- **Sample dual export (first minute, no file):** open the sample, click
  Export, capture both `download` events, assert two `*.pdf` files save and
  each is a non-empty valid PDF (loads with a positive page count).
- **No upload:** with request interception, assert no cross-origin request
  and that no request body carries the book bytes across the whole export
  (same-origin font-asset GETs allowed), mirroring `import.spec.ts`.
- **300k progress, live surface, no freeze:** open Middlemarch, settle,
  click Export; assert the progress label advances through both phases, the
  studio stays interactive during the export (a control responds / the
  slider is still operable), and both downloads complete within a generous
  timeout without a crash.
- **Print setup:** open the disclosure, choose Short edge and a different
  sheets-per-signature, export the sample, and assert the export still
  completes and saves two files.
- **390px:** Export button and opened print-setup usable at 390x780, ~44px
  targets, no horizontal scroll.
**AC:** all pass; `import.spec.ts`, `pagination.spec.ts`, `preview.spec.ts`,
`typography.spec.ts`, and `budget.spec.ts` pass unchanged.

### T8 — README + copy sweep + recorded fold test
Update the README: the "Right now it..." paragraph gains the dual export
and stops listing PDF/imposition as a later milestone; the code map gains
`src/export/` and `public/fonts/embed/`; the e2e list gains the export
spec. Print and fold the sample's signature PDF once and record the result.
Mechanically sweep every added or edited user-visible string.
**AC:** README accurate against shipped behavior with verified commands; the
physical fold of the sample reads in order and is recorded in
`result.json`'s `summary`; the sweep over all strings added in T1–T7 and
this spec's §4 finds no "—"/"–", no banned vocabulary, and no negative
empty-state phrasing.

---

## 4. Copy (swept reference — ship these or better)
All strings below are swept: no em/en dashes, no banned vocabulary, no
negative phrasing. Numbers and titles are examples.

- Export button, idle: **Export**
- Export hint (kept): **Export saves a print-ready PDF.**
- Export button/label while typesetting: **Typesetting page 240 of 903**
- While imposing: **Building signatures**
- On completion, status line: **Saved two files.**
- Fallback download links: **Save typeset PDF**, **Save signatures PDF**
- On failure: **The export stopped before it finished. Try again.**
- Disclosure summary: **Print setup**
- Print-setup labels: **Sheets per signature**, **Duplex flip**
- Duplex options: **Long edge**, **Short edge**
- Filenames: **middlemarch-typeset.pdf**, **middlemarch-signatures.pdf**
  (slug of the book title; `book-typeset.pdf` when the title is empty)

Book titles, author names, and chapter titles in running heads are book
data and exempt from the sweep; the product copy around them is not. Sweep
before done: reject "—"/"–", the banned vocabulary list, and negative
openers in every string added to `ControlPanel.tsx`, `Studio.tsx`, the
export worker's error messages, `download.ts`, and the README.

---

## 5. Test plan (which automated test proves each criterion)

### 5.1 Unit / integration (Vitest + jsdom; pdf-lib runs headless)
| Criterion | Test |
|---|---|
| px->pt and page box match the preview geometry | `geometry.test.ts` |
| Rendered line text identical to the preview | `lineText.test.ts` snapshot vs `PageView`'s prior output |
| Imposition folds to reading order (8-page, 16-page) | `impose.test.ts` goldens |
| Padding to whole sheets; last signature may be shorter | `impose.test.ts` |
| Short-edge flip transform correct | `impose.test.ts` |
| Font resolves per face; system serif -> fallback | `fonts.test.ts` |
| Typeset PDF page count equals the settled result | `pdf.test.ts`: load-back page count == `result.pageCount` |
| Font is embedded and subsetted (renders without it) | `pdf.test.ts`: font descriptor has an embedded FontFile + subset tag |
| Typeset page sizes are the trim in points per side | `pdf.test.ts` |
| Signature PDF page count and folded-sheet size | `pdf.test.ts` |
| Worker drives both phases; latest-wins; error voice | `client.test.ts` with a fake worker |
| Filename slug safe and swept | `download.test.ts` |
| Export flows through the preview without re-paginate/blank | `BookPreview.test.tsx` (fake export client) |
| Studio bumps a request and applies print setup only | `Studio.test.tsx` |
| Button states, print-setup controls, copy swept | `ControlPanel.test.tsx` |
| Existing suites intact | engine, worker, budget, preview, panel, Studio, App suites unchanged |

### 5.2 Browser harness (Playwright, Chromium) — `e2e/export.spec.ts`
| Criterion | Test |
|---|---|
| Both PDFs generate in-browser, no upload | no-upload interception test |
| Dual export reachable from the sample, first minute | sample export test |
| Typeset renders without the font (embedded) | proven in `pdf.test.ts`; the sample export produces a valid, openable PDF |
| 300k exports with progress, no freeze, no OOM | Middlemarch progress + live-surface test |
| Print setup (sheets-per-signature, flip) works | print-setup export test |
| Mobile 390px | Export and print-setup usable, no horizontal scroll |
| EPIC 2/3/4/5 harnesses unaffected | the five existing specs pass unchanged |

### 5.3 Recorded verification (part of DONE)
Record in `result.json` `summary`: the sample's typeset and signature page
counts, confirmation that a **physical fold of the sample's signature PDF
reads in correct order** (the imposition acceptance criterion that cannot
be automated), the observed export time and peak behavior for the 300k
book (completed without freeze or OOM), and confirmation that the network
tab showed no upload of the book during export.

---

## 6. Data model / migrations
No database, no server. Storage stays forward-only:
- `bindery.design`, `bindery.budget` — existing, untouched.
- `bindery.print` (new, optional, `{ v: 1, imposition }`) — sheets per
  signature and flip; readers clamp to valid whole-sheet values and a known
  flip, and return `DEFAULT_IMPOSITION` on any error. It holds no book data.
Engine shapes (`DesignSpec`, `Document`, `PaginationResult`, all worker
messages) are unchanged; export consumes them read-only. New committed
assets: the four faces' TTF/OTF under `public/fonts/embed/` plus their
provenance, lazy-loaded on export only.

---

## 7. QUALITY BAR mapping (binding; budget from the start)
- **§1 Perceived speed / differentiator:** export runs in a worker with
  streamed progress, so the studio and the paper-budget slider stay live;
  the 300k export completes without freezing the UI or running out of
  memory; the file reproduces the preview exactly (page count and
  geometry), keeping the trust the re-flow earns. Asserted in e2e and unit.
- **§2 Mobile-first:** Export and print-setup usable at 390px, ~44px
  targets, no horizontal scroll; asserted in e2e.
- **§3 Designed states:** the button has a designed idle, a progress label
  that names the phase and page, and an error state that says what to do
  next; the preview never blanks during export.
- **§4 First-run:** the sample exports two valid PDFs with no user file,
  reachable in the first minute (e2e-proven). The EPIC 7 guided walkthrough
  is out of scope.
- **§5 Security hygiene:** no server, no new outbound path, no book bytes in
  any request; inputs are a bounded select and a two-way toggle; storage
  guarded; no book text or PII in logs, messages, or errors.
- **§6 Accessibility:** labeled Export button with `aria-busy`, one polite
  progress region, labeled print-setup inputs in a fieldset, keyboard reach
  and visible focus everywhere.
- **§7 Radically simple interface:** Export stays the single primary action;
  print setup hides behind one disclosure with sensible defaults, so the
  common path is one click.
- **§8 Copy sounds human:** §4 strings are swept; the sweep is a test and a
  T8 gate.
- **§9 README:** updated truthfully for dual export; commands verified; no
  pipeline jargon.

Reconciliation: the two PDFs, the imposition math, the worker, and their
tests are the scoped work, and meeting the bar on them is in scope. Cover
math, other formats, and cloud storage stay out however tempting; if
meeting the bar ever appeared to require one of them, that is a `blocked`,
not a quiet expansion.

---

## 8. Definition of done
- All eight tasks' ACs met; `lint`, `typecheck`, `test`, and all six
  Playwright specs green (`export.spec.ts` new; the other five unchanged).
- One Export click produces a typeset PDF and a signature PDF entirely in
  the browser, with no upload of the book (network tab confirms).
- The typeset PDF embeds the book's face (subset) and renders on a machine
  lacking the font; its page count and page geometry match the preview for
  the same settings.
- The signature PDF's sheets fold into correct reading order: the automated
  8-page and 16-page goldens hold and a physical fold of the sample reads in
  order (recorded per §5.3).
- Exporting the 300k-word book shows progress, keeps the UI interactive,
  and completes without an out-of-memory failure.
- Print setup (sheets-per-signature, duplex flip) changes the imposition
  only; it never re-flows the book or moves the design.
- A session that never exports is behaviorally identical to EPIC 5: default
  path, budgets, determinism, and golden page counts unchanged.

### Planner AC -> coverage
1. *Both PDFs generate entirely in the browser with no upload (network tab)*
   -> §2.7 worker build, §2.10 no outbound path; T4, T5, T7 no-upload test;
   §5.2 row 1.
2. *Fonts are embedded: the typeset PDF renders on a machine lacking the
   font* -> §2.4 embedding + subset, system-serif fallback; T2, T3
   embedded-font assertion; §5.1 embedded-font row.
3. *Imposed signatures fold into correct reading order, verified against
   known 8-page and 16-page orderings and a physical fold of the sample* ->
   §2.6 arithmetic and goldens; T1 golden tests; T8 recorded physical fold;
   §5.1 imposition rows, §5.3.
4. *The typeset PDF page count matches the on-screen preview for the same
   settings* -> §2.5 one page per `Page`; T3 load-back count == `pageCount`;
   §5.1 page-count row.
5. *Exporting the 300k book shows progress, does not freeze the UI, and
   completes without an out-of-memory failure* -> §2.7 worker + memory
   measures, §2.8 progress; T7 300k test; §5.2 row, §5.3.
</content>
</invoke>
