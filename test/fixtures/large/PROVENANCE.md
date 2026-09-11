# Large EPUB test fixtures

These two real public-domain novels back the pagination engine's performance
and determinism tests. They are genuine prose (not repeated filler, which
would game the measurement cache and misrepresent timing) at the two size
classes the budgets are stated against.

They are test assets only. They live under `test/fixtures/large/` and are
never included in the app bundle (the app ships only its own small sample in
`public/sample/`).

## Files

| File | Title | Author | Chapters | Kept words (measured) |
|---|---|---|---|---|
| `emma.epub` | Emma | Jane Austen | 61 | 160,330 |
| `middlemarch.epub` | Middlemarch | George Eliot | 102 | 318,615 |

Word counts are the kept, flowable words (headings, paragraphs, notes) the
engine actually lays out, counted through the app's own `parseEpub`. The
~2 second settle budget binds on `middlemarch.epub` (the ~300k-word class).

## Source and license

Both are produced by Standard Ebooks (clean EPUB3, US public domain):

- Emma: https://standardebooks.org/ebooks/jane-austen/emma
- Middlemarch: https://standardebooks.org/ebooks/george-eliot/middlemarch

The novels are in the public domain. Standard Ebooks dedicates its editions
to the public domain via the CC0 1.0 Universal Public Domain Dedication, so
the bytes are freely redistributable. Downloaded once and committed; the
tests never fetch over the network, which keeps them offline, deterministic,
and true to the app's privacy ethos.
