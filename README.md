# The Bindery Desk

Turn a story you already have into a printable, foldable book, entirely in
your browser. Drop in the EPUB that your fan archive or ebook library
exports and The Bindery Desk reads it into a clean book structure: title,
author, and chapters in reading order. Your file never leaves your computer.

Right now it imports and parses an EPUB, then lays the whole book out and
shows it as a real book: facing pages with mirrored margins, running headers,
page numbers, and chapters that open on the right. A control panel beside the
preview gives you the dials your Word template used to hold: page size, font,
font size, line spacing, margins, chapter opening, running-header content,
widow and orphan control, and hyphenation. Turn any dial and the whole book
re-flows live. Above the dials sits the paper-budget slider: pick how many
sheets of paper the book should fit, and a solver adjusts font size, line
spacing, and margins inside bounds you set, then re-flows the whole book to
the closest real design. The readout always states the exact sheet and
signature count of the book on screen, and when your bounds cannot reach a
target it names the count they can reach. The layout runs in a background
worker, so even a 300,000-word novel settles in about a second and a half,
first feedback lands well under a tenth of a second, and the preview keeps
the last book on screen while the new one arrives, so it never blinks. Your
dials and bounds are saved in this browser and come back when you reopen the
book. One Export click then saves two PDFs: a typeset book that matches the
preview page for page with the font embedded, and a printer-ready signature
PDF whose sheets fold into reading order. Both build in a background worker,
so even a 300,000-word novel exports without freezing the studio, and a
Print setup panel sets sheets per signature and the duplex flip your printer
uses. Nothing is uploaded; both files are built from bytes already in the tab.
Save your work as a project file and open it later to bring the same book back
exactly, down to the sheet count. Save a house style to carry one book's look to
the next book in a single click. Project and house-style files are ordinary
downloads you open back from your own disk, so nothing leaves your computer. The
first time you visit, a short guided walkthrough leads you from opening the
sample to your first export, then steps aside and stays gone.

## Your file stays on your computer

There is no server and no upload. Parsing happens in the browser over the
bytes of the file you choose. You can confirm this yourself:

1. Open the app and your browser's developer tools, Network tab.
2. Import an EPUB. You will see no request carrying the file.
3. Set the Network tab to offline and import another already-downloaded
   EPUB. It still works, because nothing needs the network.

## Quick start (development)

Requirements: Node.js 22 and npm.

```bash
git clone <this-repo-url>
cd the-bindery-desk
npm install
npm run dev
```

Open the printed local URL (Vite prints it, usually `http://localhost:5173`).
Tap "Open the sample book" to see a real book parsed with no file of your own.

## Run the production build with Docker

This builds the static site and serves it with nginx on port 80.

```bash
docker build -t bindery-desk .
docker run --rm -p 8080:80 bindery-desk
```

Open `http://localhost:8080`.

### Optional runtime configuration

Error tracking (Sentry-compatible) and analytics (Umami) are off by default
and turn on only when you provide their values at container start. Nothing is
baked into the build.

```bash
docker run --rm -p 8080:80 \
  -e SENTRY_DSN="https://key@your-glitchtip/1" \
  -e UMAMI_URL="https://your-umami/script.js" \
  -e UMAMI_WEBSITE_ID="your-website-id" \
  bindery-desk
```

At startup the container writes these into `/config.js`. Unset values stay
empty and keep that integration off. Copy `.env.example` to `.env` to keep
your own values out of version control.

## Tests

Unit and integration tests (Vitest, jsdom):

```bash
npm test
npm run lint
npm run typecheck
```

End-to-end tests (Playwright) drive a real browser against the production
build. The repo pins an exact Playwright version and runs the suite in the
matching official container, so you do not install browsers on your host:

```bash
bash scripts/e2e.sh
```

On a clean single-version machine you can instead run:

```bash
npx playwright install --with-deps
npm run test:e2e
```

## Where the code lives

```
src/
  model/         in-memory book model (Document, Chapter, Block) + import report
  epub/          the EPUB parser: unzip, container, OPF, TOC, chapters, XHTML
  engine/        the pagination engine: line breaking, hyphenation, page assembly, worker, font loading
  engine/budget.ts  sheet math, solver bounds, the density ladder, the page predictor
  engine/solve.ts   the worker-side paper-budget solve (bounded exact counts)
  fonts/         the curated font catalog and the main-thread loader
  ui/            import states, the studio (control panel + facing-page preview), structure view
  ui/design/     pure design logic: trim presets, setters, session persistence
  ui/budget/     the paper-budget slider, readout, bounds, and their persistence
  ui/firstRun/   the guided first-run walkthrough and its persisted flag
  export/        the dual-PDF exporter: geometry, imposition math, PDF builders, worker, client, download
  project/       project and house-style files: the source hash, file model, and save/open IO
  integrations/  Sentry and Umami, both runtime-gated and privacy-safe
  config/        runtime config read from window.__BINDERY_CONFIG__
  sample/        one-tap loader for the bundled sample book
public/sample/   the bundled public-domain sample EPUB
public/fonts/    the curated woff2 book faces, their license, and provenance
public/fonts/embed/  TTF faces the exporter subsets and embeds, loaded only on export
docker/          nginx config and the startup script that generates /config.js
e2e/             Playwright specs: import, pagination, preview, typography, budget, export, project, first render, mobile, keyboard
```

The dials write a plain `DesignSpec`; every change re-paginates in the worker
against the book it already holds, so a re-flow never re-reads the file. The
control setters live in `src/ui/design/` and are pure, so the same design always
yields the same pages.

The parser is pure over its input bytes: it returns a fully materialized
model and keeps no reference to the archive, so later work can re-flow the
book without re-reading the file.

## The sample book

`public/sample/aesops-fables.epub` is a selection of Aesop's Fables in the
George Fyler Townsend translation, which is in the public domain worldwide
and redistributable. Each of its four chapters opens with a well-known fable
and carries a further selection from `scripts/sampleFables.json`, so the
sample is a real small book the paper-budget slider can move. Regenerate it
with `node scripts/makeSample.mjs`.

## Bundled fonts

The Font dial offers the system serif plus four open-licensed book faces, each
bundled as a Latin-subset woff2 in `public/fonts/`: **EB Garamond**, **Libre
Baskerville**, **Lora**, and **Source Serif 4**. All four are licensed under the
SIL Open Font License 1.1 (`public/fonts/OFL.txt`), with sources and versions in
`public/fonts/PROVENANCE.md`. They are same-origin app assets, so selecting one
does not send your book anywhere, and they work offline after first load.

For export, the same four faces ship as TTFs in `public/fonts/embed/`, loaded
only when you export and subset into the PDF so the file renders on a machine
that lacks the font. The system serif has no bundled file, so exporting it
embeds Lora in its place, recorded in `public/fonts/PROVENANCE.md`.

## License

MIT. See [LICENSE](./LICENSE). The bundled fonts keep their own OFL 1.1 license.
