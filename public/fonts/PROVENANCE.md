# Bundled fonts

Every face here is licensed under the SIL Open Font License 1.1 (see `OFL.txt`),
so the files redistribute freely and embed cleanly in an exported PDF later.

Each file is a Latin-subset woff2 repackaged by Fontsource from the upstream
Google Fonts sources. Two weights per face (regular 400, bold 700) because
chapter headings measure and render bold.

| File | Family | Weight | Source |
|---|---|---|---|
| `eb-garamond-400.woff2` | EB Garamond | 400 | https://fonts.google.com/specimen/EB+Garamond |
| `eb-garamond-700.woff2` | EB Garamond | 700 | https://fonts.google.com/specimen/EB+Garamond |
| `libre-baskerville-400.woff2` | Libre Baskerville | 400 | https://fonts.google.com/specimen/Libre+Baskerville |
| `libre-baskerville-700.woff2` | Libre Baskerville | 700 | https://fonts.google.com/specimen/Libre+Baskerville |
| `lora-400.woff2` | Lora | 400 | https://fonts.google.com/specimen/Lora |
| `lora-700.woff2` | Lora | 700 | https://fonts.google.com/specimen/Lora |
| `source-serif-4-400.woff2` | Source Serif 4 | 400 | https://fonts.google.com/specimen/Source+Serif+4 |
| `source-serif-4-700.woff2` | Source Serif 4 | 700 | https://fonts.google.com/specimen/Source+Serif+4 |

## Embed files (`embed/`)

The PDF export embeds a TTF, not the woff2, because the subsetting path does not
consume woff2 reliably. Each TTF under `embed/` is the matching woff2 above
losslessly decompressed to TrueType, so it carries the exact same glyph outlines
and metrics as the on-screen face and the exported book reproduces the preview.
They are fetched only when an export runs, so the initial bundle is untouched.

| File | Family | Weight | Derived from |
|---|---|---|---|
| `embed/eb-garamond-400.ttf` | EB Garamond | 400 | `eb-garamond-400.woff2` |
| `embed/eb-garamond-700.ttf` | EB Garamond | 700 | `eb-garamond-700.woff2` |
| `embed/libre-baskerville-400.ttf` | Libre Baskerville | 400 | `libre-baskerville-400.woff2` |
| `embed/libre-baskerville-700.ttf` | Libre Baskerville | 700 | `libre-baskerville-700.woff2` |
| `embed/lora-400.ttf` | Lora | 400 | `lora-400.woff2` |
| `embed/lora-700.ttf` | Lora | 700 | `lora-700.woff2` |
| `embed/source-serif-4-400.ttf` | Source Serif 4 | 400 | `source-serif-4-400.woff2` |
| `embed/source-serif-4-700.ttf` | Source Serif 4 | 700 | `source-serif-4-700.woff2` |

The default design uses the OS system serif (Georgia), which has no bundled
file. Export substitutes Lora for it, so every export embeds a real, subsettable
OFL face. This substitution never changes the page count: the engine's lines are
pre-broken and left aligned, so a face with slightly different metrics cannot
re-break a line. The same OFL 1.1 license (`OFL.txt`) covers these files; there
is no new license obligation.

Copyright holders (see each specimen page for full author lists):

- EB Garamond: Copyright 2017 The EB Garamond Project Authors.
- Libre Baskerville: Copyright 2012 The Libre Baskerville Project Authors.
- Lora: Copyright 2011 The Lora Project Authors.
- Source Serif 4: Copyright 2014-2023 Adobe (https://github.com/adobe-fonts/source-serif).

`OFL.txt` carries the full license text, which applies to all faces above.

These files are same-origin app assets served by the app itself. Loading them is
not the user's book leaving the browser, and they work offline after first load.
