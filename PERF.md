# Measured performance and audit record

The polish EPIC measures the product against the quality bar and the quality
differentiator, and locks each number in with an automated test. These are the
numbers the suites recorded on the production build, in the pinned Playwright
container on a shared host. Retries are the sanctioned shared-host allowance;
the budgets below are the kill conditions.

## Perceived speed (QUALITY BAR §1)

| Budget | Measured | Limit | Where |
|---|---|---|---|
| First meaningful render (empty-state heading) | ~167 ms | < 1000 ms | `e2e/firstrender.spec.ts` |
| First contentful paint | ~208 ms | < 1000 ms | `e2e/firstrender.spec.ts` |
| Dial-change first feedback (sample) | ~16 to 35 ms | ≤ 100 ms | `e2e/firstrender.spec.ts` |

A dial change keeps a page leaf mounted, shows no skeleton, and never blanks
the mounted book.

## Whole-book re-flow (the quality differentiator)

Both books are the committed fixtures. First feedback is the time to the first
painted spread; settle is the time to the final exact result.

| Book | Words | Pages | First feedback | Settle | Limit |
|---|---|---|---|---|---|
| Emma | 160,330 | 494 | ~91 ms | ~919 ms | ≤ 100 ms / ≤ 2000 ms |
| Middlemarch | 318,615 | 974 | ~72 ms | ~1399 ms | ≤ 100 ms / ≤ 2000 ms |

Paper-budget slider on Middlemarch: dragging from 244 to a 195-sheet target
gave first feedback ~62 ms and settled in ~1464 ms, landing within one sheet of
the target, with the reading place kept across the solve
(`e2e/budget.spec.ts`). The pass stays in the worker: the largest main-thread
long task during the 300k re-flow was under 90 ms (`e2e/pagination.spec.ts`).

## Accessibility (QUALITY BAR §6)

Contrast, dependency-free WCAG audit over the theme tokens in `src/styles.css`,
both themes (`src/theme/contrast.test.ts`). Every pair clears its threshold:

| Pair | Light | Dark | Limit |
|---|---|---|---|
| `--ink` on `--bg` | 14.8 | 15.6 | 4.5 |
| `--ink` on `--surface` | 16.1 | 14.4 | 4.5 |
| `--ink-soft` on `--surface` | 7.4 | 7.5 | 4.5 |
| `--ink-soft` on `--bg` | 6.8 | 8.1 | 4.5 |
| `--accent-ink` on `--accent` | 7.3 | 7.5 | 4.5 |
| `--accent` on `--surface` | 7.3 | 7.0 | 4.5 |
| `--focus` on `--surface` | 4.6 | 7.0 | 3.0 |

No token needed adjustment. Every studio control is reachable by Tab and shows
a visible focus ring (`e2e/a11y.spec.ts`); every input resolves by its label
and the screens carry one `<main>`, one `<h1>`, `role="alert"` on errors, and
polite live regions on the status, readout, count, and notice
(`src/a11y.test.tsx`). The app renders no meaningful `<img>`; the one
decorative header glyph is `aria-hidden`.

## Mobile (QUALITY BAR §2)

At 390×780 there is no horizontal scroll on the empty dropzone, the unreadable
error, the structure view, or the full studio with the bounds and print-setup
disclosures open; primary targets clear 44 px and body text is 17 px
(`e2e/mobile.spec.ts`, plus the existing budget/project/import/export/preview/
typography mobile checks).

## Copy, designed states, privacy

A comprehensive sweep over the previously-unswept surfaces (import, loading,
all three error kinds, structure, app shell) and the README finds zero
em/en dashes, banned vocabulary, or negative empty-state phrasing
(`src/copy.sweep.test.tsx`). An app-level error boundary shows a designed,
product-voice fallback with a recovery action on an unexpected throw, and never
renders on a healthy session (`src/ui/ErrorBoundary.test.tsx`). Import, save,
and open still issue no network request (existing import/export/project checks).

## README run path

The stranger run path (`docker build` / `docker run -p 8080:80`) is verified
against the root `Dockerfile` (multi-stage Node build to nginx on port 80) and
`docker/40-bindery-config.sh` (runtime `SENTRY_DSN` / `UMAMI_URL` /
`UMAMI_WEBSITE_ID`). `docker-compose.staging.yml` is intentionally omitted from
the run steps: it is factory-staging infra that joins an external network and
only `expose`s port 80, so it reaches no port on a stranger's machine.
