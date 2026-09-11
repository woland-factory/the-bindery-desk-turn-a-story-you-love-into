# The Bindery Desk

Turn a story you already have into a printable, foldable book, entirely in
your browser. Drop in the EPUB that your fan archive or ebook library
exports and The Bindery Desk reads it into a clean book structure: title,
author, and chapters in reading order. Your file never leaves your computer.

Right now it imports and parses an EPUB, then lays the whole book out into
pages and shows the page count with the first laid-out pages. The layout
runs in a background worker, so even a 300,000-word novel paginates in about
a second and a half while the page stays responsive. The polished
facing-page preview, typography dials, the paper-budget slider, and PDF
export arrive in later milestones.

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
  engine/        the pagination engine: line breaking, hyphenation, page assembly, worker
  ui/            import surface and designed empty / loading / error / structure states
  integrations/  Sentry and Umami, both runtime-gated and privacy-safe
  config/        runtime config read from window.__BINDERY_CONFIG__
  sample/        one-tap loader for the bundled sample book
public/sample/   the bundled public-domain sample EPUB
docker/          nginx config and the startup script that generates /config.js
e2e/             Playwright specs
```

The parser is pure over its input bytes: it returns a fully materialized
model and keeps no reference to the archive, so later work can re-flow the
book without re-reading the file.

## The sample book

`public/sample/aesops-fables.epub` is a short selection of Aesop's Fables in
the George Fyler Townsend translation (1887), which is in the public domain
worldwide and redistributable. Regenerate it with `node scripts/makeSample.mjs`.

## License

MIT. See [LICENSE](./LICENSE).
