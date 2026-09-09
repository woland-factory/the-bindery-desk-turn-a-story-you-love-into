# VALIDATION — The Bindery Desk

**Verdict: VIABLE** — with one architectural condition the plan must treat as binding
(see "Risk 1"). The value case is among the strongest a factory idea can have: a
documented community pain (hours of manual Word formatting per book), the incumbent
free tools publicly wishing for exactly this feature on their own issue trackers, and
a durable artifact (a physical, sewn book) that literally outlives the software. The
risk is concentrated almost entirely in one subsystem: the browser pagination engine.

---

## Core value proposition

Drop the EPUB you already have onto the page and see it, seconds later, as a real
typeset book — facing pages, mirrored margins, running headers, chapters opening
recto — then turn dials (page size, font, paper budget) and export both the typeset
book PDF and the printer-ready imposed signatures in one click, with the file never
leaving your computer.

What is genuinely new is the fusion: typesetting and imposition in one live loop.
Every existing free tool does exactly one half (bookbinder.app/Folio: imposition of
an already-formatted PDF; Calibre: screen-style EPUB→PDF the community rejects) and
their own wishlists point at this seam (bookbinder-js issue #87: EPUB support is the
maintainer's "pie in the sky"). The paper-budget slider — "fit this book into N
sheets" with live re-flow — is only possible in a tool that owns both halves, and it
is a legitimate signature moment: a mechanic, not an adjective.

## The four tests

1. **Would anyone's life be genuinely better?** Yes, and it is documented, not
   inferred. The fanbinding community's own guide (Folio's blog) describes hours of
   manual typesetting per book as the standard path. The ao3-epub-to-odt tool exists
   precisely because this pain is real, and it still requires manual LibreOffice
   passes plus a separate imposition tool.
2. **Couldn't a chatbot or an existing free tool do it?** No. A chatbot cannot be a
   live direct-manipulation WYSIWYG surface, and uploading a fan work to an LLM
   violates a hard community norm ("the story never leaves your computer" is a
   marketed feature of the incumbent tools). Calibre is the fifteen-year-old free
   alternative and the community demonstrably does not accept its output. The free
   imposition tools cannot accept EPUBs and say so themselves.
3. **Durable artifact?** Unusually strong: a physical book on a shelf, plus a
   re-openable local project file, plus reusable "house style" presets that make
   book #12 match books #1–11. Layer 1 alone clears this bar.
4. **Can agents deliver it at the quality bar?** Yes, conditionally. Everything
   except the pagination engine is well-trodden: EPUB parsing (established JS
   libraries), client-side PDF generation with font embedding (pdf-lib/fontkit
   class libraries), imposition math (deterministic arithmetic with MIT-licensed
   prior art in bookbinder-js). The pagination engine is the one hard subsystem and
   it is an engineering problem, not a research problem — see Risk 1 for the
   condition.

## Minimal feature set (the smallest product that delivers the core value)

1. **EPUB import, fully client-side.** Drag-and-drop; chapter detection from the
   spine/TOC; graceful handling of AO3-style exports (author notes, inline images —
   keep or drop, never crash). A bundled public-domain sample book so the first
   screen shows real output with zero user input.
2. **Live facing-page preview**, virtualized (render only visible spreads), with
   correct book conventions: mirrored inner/outer margins, running headers, page
   numbers, chapters opening on the recto.
3. **The dials the community actually fights Word for** (the set their shared
   templates encode, no more): trim/page size, font (small curated embeddable set),
   font size, line spacing, margins, chapter-opening style, running header content,
   widow/orphan control.
4. **The paper-budget slider**: fit the book into N sheets; re-flows live by
   negotiating font size/leading/margins within user-set bounds. This is the
   signature moment and gets depth-first investment.
5. **One-click dual export**: the typeset book PDF and the imposed signature PDF
   (configurable sheets-per-signature, printer duplex options), fonts embedded,
   both generated in the browser.
6. **Project file save/load** (a local JSON of every setting) — cheap to build and
   it is durability layer 2; saved styles reapplied to the next book are layer 3.

Out of the minimal set (name them so nobody builds them): covers/dust jackets and
3D preview (the bolder variant, not this product), accounts, any server-side
processing, a template marketplace, InDesign-grade features (kerning pairs, drop
caps galleries, ornament libraries), editing the story text itself.

## Main risks

1. **The pagination engine is the whole risk, and the naive build fails.**
   DOM-flow pagination (paged.js over a full novel) is documented to struggle near
   300 pages; a 150k–300k-word fic will be minutes-per-reflow, and the signature
   moment dies. The deliverable path exists but must be mandated at plan level:
   measurement-based pagination (text metrics via canvas/Range APIs, greedy line
   breaking) computed in a Web Worker, with a virtualized preview that lays out
   geometry for the whole book but renders only visible spreads, and progressive
   feedback (page-count and preview update within ~100ms even if the full pass
   takes 1–2s on a 300k-word book). If the plan does not pin this architecture,
   the build will take the paged.js shortcut and ship the failure mode.
2. **The quality target is a careful Word template, and missing it is fatal in one
   try.** Binders start a book at most monthly; a first output with visible flaws
   (broken headers, orphaned lines, unmirrored margins) sends them back to Word
   with no second session. Mitigation is honest scoping: beat Word-template output
   on the dials listed above, do not chase InDesign. Note the target is NOT TeX:
   the community's own standard is Word's greedy line-breaker, so a greedy breaker
   with hyphenation and widow control clears their bar.
3. **Real-world EPUBs are messy.** AO3 exports carry inline images, notes, and
   nonstandard markup; the first broken-file screenshot travels fast in a community
   this connected. Mitigation: scope v1 explicitly to AO3-style and Standard
   Ebooks/Gutenberg EPUBs, degrade gracefully (strip what you cannot lay out,
   tell the user what was kept), and never render a blank page or a crash.
4. **The serious-craft segment may still finish in Word.** Some binders treat
   typesetting as the craft. Acceptable: the product wins the large middle the
   community guide itself describes, and its typeset-PDF export feeds any manual
   finishing pipeline rather than fighting it.
5. **Incumbent absorption** (bookbinder.app adds EPUB import someday). Low urgency:
   the wish has sat unbuilt on their tracker precisely because the lift is the hard
   half. Not a reason to reject; a reason not to dawdle.

## What would make me reject it

- If live re-flow of a ~150k-word book cannot give perceptible feedback within
  ~100ms and settle within a couple of seconds, the paper-budget slider becomes
  "wait 20 seconds," the signature moment is gone, and what remains (batch
  EPUB→PDF) loses to Calibre-plus-Folio at the same price of free. This is the
  kill condition; the plan should make it an explicit, measured acceptance
  criterion with a large real-world test file.
- If any part of v1 requires an upload, account, or server-side processing: the
  privacy norm is a hard community requirement, and breaking it forfeits the
  audience regardless of output quality.
- If typographic output ships below the community's Word-template standard
  (no mirrored margins, broken running headers, uncontrolled widows), the first
  impression fails in a one-shot-cadence community and there is no recovery.

## Notes for the planner

- No runtime LLM anywhere in the product; no BYOK surface, no gateway request.
- Static client-side app: the staging deploy scaffold is trivial (static server in
  a container), leaving the build budget where the risk is.
- Build order should be depth-first on the engine: EPUB→paginated preview before
  any dial polish; the budget slider before feature breadth; imposition math is
  low-risk and can land late.
- Ship a bundled sample book so the deployed app shows the differentiator within a
  minute with no user file, per the first-run bar.
