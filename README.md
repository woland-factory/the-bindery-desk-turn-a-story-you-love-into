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
re-flows live. The layout runs in a background worker, so even a 300,000-word
novel settles in about a second and a half, first feedback lands well under a
tenth of a second, and the preview keeps the last book on screen while the new
one arrives, so it never blinks. Your dials are saved in this browser and come
back when you reopen the book. The paper-budget slider and PDF export arrive in
later milestones.

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
  fonts/         the curated font catalog and the main-thread loader
  ui/            import states, the studio (control panel + facing-page preview), structure view
  ui/design/     pure design logic: trim presets, setters, session persistence
  integrations/  Sentry and Umami, both runtime-gated and privacy-safe
  config/        runtime config read from window.__BINDERY_CONFIG__
  sample/        one-tap loader for the bundled sample book
public/sample/   the bundled public-domain sample EPUB
public/fonts/    the curated woff2 book faces, their license, and provenance
docker/          nginx config and the startup script that generates /config.js
e2e/             Playwright specs
```

The dials write a plain `DesignSpec`; every change re-paginates in the worker
against the book it already holds, so a re-flow never re-reads the file. The
control setters live in `src/ui/design/` and are pure, so the same design always
yields the same pages.

The parser is pure over its input bytes: it returns a fully materialized
model and keeps no reference to the archive, so later work can re-flow the
book without re-reading the file.

## The sample book

`public/sample/aesops-fables.epub` is a short selection of Aesop's Fables in
the George Fyler Townsend translation (1887), which is in the public domain
worldwide and redistributable. Regenerate it with `node scripts/makeSample.mjs`.

## Bundled fonts

The Font dial offers the system serif plus four open-licensed book faces, each
bundled as a Latin-subset woff2 in `public/fonts/`: **EB Garamond**, **Libre
Baskerville**, **Lora**, and **Source Serif 4**. All four are licensed under the
SIL Open Font License 1.1 (`public/fonts/OFL.txt`), with sources and versions in
`public/fonts/PROVENANCE.md`. They are same-origin app assets, so selecting one
does not send your book anywhere, and they work offline after first load.

## License

MIT. See [LICENSE](./LICENSE). The bundled fonts keep their own OFL 1.1 license.
