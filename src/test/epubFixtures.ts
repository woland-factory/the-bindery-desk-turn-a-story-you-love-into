// Synthetic EPUBs built in code (zipped with fflate) so tests run with no
// committed binaries. Each builder returns raw bytes, exactly what the
// import surface hands to parseEpub. Expected values live in the specs.

import { zipSync, type Zippable } from "fflate";

const enc = new TextEncoder();

function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  const data: Zippable = {};
  for (const [path, content] of Object.entries(files)) {
    data[path] = typeof content === "string" ? enc.encode(content) : content;
  }
  return zipSync(data);
}

const CONTAINER = (opfPath: string) => `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const xhtml = (bodyAttrs: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>doc</title></head>
<body ${bodyAttrs}>${body}</body>
</html>`;

// --- AO3-style: EPUB2 with an NCX, a title page, a work-metadata preface,
//     an inline image, a chapter-notes section, and three chapters. ---
export function makeAo3(): Uint8Array {
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>A Tale of Testing</dc:title>
    <dc:creator>Ada Archivist</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>
    <item id="preface" href="preface.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
    <item id="pic" href="images/pic.png" media-type="image/png"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="titlepage"/>
    <itemref idref="preface"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
  </spine>
</package>`;

  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint playOrder="1"><navLabel><text>Title Page</text></navLabel><content src="titlepage.xhtml"/></navPoint>
    <navPoint playOrder="2"><navLabel><text>Preface</text></navLabel><content src="preface.xhtml"/></navPoint>
    <navPoint playOrder="3"><navLabel><text>The Beginning</text></navLabel><content src="chapter1.xhtml"/></navPoint>
    <navPoint playOrder="4"><navLabel><text>The Middle</text></navLabel><content src="chapter2.xhtml"/></navPoint>
    <navPoint playOrder="5"><navLabel><text>The End</text></navLabel><content src="chapter3.xhtml"/></navPoint>
  </navMap>
</ncx>`;

  return zip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": CONTAINER("OEBPS/content.opf"),
    "OEBPS/content.opf": opf,
    "OEBPS/toc.ncx": ncx,
    "OEBPS/titlepage.xhtml": xhtml("", "<h1>A Tale of Testing</h1>"),
    "OEBPS/preface.xhtml": xhtml(
      "",
      `<div><p>Rating: General Audiences</p><p>Fandom: Original Work</p>
       <p>Summary: A short test work.</p><p>Published: 2026-01-01</p></div>`,
    ),
    "OEBPS/chapter1.xhtml": xhtml(
      "",
      `<h2>The Beginning</h2>
       <p>The first paragraph of the story.</p>
       <p>The second paragraph of the story.</p>
       <div class="notes"><p>Thanks for reading this chapter.</p></div>
       <img src="images/pic.png" alt="a hand-drawn map"/>`,
    ),
    "OEBPS/chapter2.xhtml": xhtml("", `<h2>The Middle</h2><p>Middle one.</p><p>Middle two.</p>`),
    "OEBPS/chapter3.xhtml": xhtml("", `<h2>The End</h2><p>End one.</p><p>End two.</p>`),
    "OEBPS/images/pic.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  });
}

// --- Standard Ebooks / Gutenberg-style: EPUB3 with a nav document,
//     semantic sections, a colophon, and three chapters. ---
export function makeStandardEbooks(): Uint8Array {
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Public Domain Reader</dc:title>
    <dc:creator>Jane Author</dc:creator>
    <dc:creator>John Coauthor</dc:creator>
    <dc:language>en-US</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="chapter-3.xhtml" media-type="application/xhtml+xml"/>
    <item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
    <itemref idref="colophon"/>
  </spine>
</package>`;

  const nav = xhtml(
    "",
    `<nav epub:type="toc"><ol>
      <li><a href="chapter-1.xhtml">The First Part</a></li>
      <li><a href="chapter-2.xhtml">The Second Part</a></li>
      <li><a href="chapter-3.xhtml">The Third Part</a></li>
      <li><a href="colophon.xhtml">Colophon</a></li>
    </ol></nav>`,
  );

  const chapter = (title: string) =>
    xhtml(
      'epub:type="bodymatter"',
      `<section epub:type="chapter"><h2>${title}</h2>
       <p>A first paragraph here.</p><p>A second paragraph here.</p></section>`,
    );

  return zip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": CONTAINER("content.opf"),
    "content.opf": opf,
    "nav.xhtml": nav,
    "chapter-1.xhtml": chapter("The First Part"),
    "chapter-2.xhtml": chapter("The Second Part"),
    "chapter-3.xhtml": chapter("The Third Part"),
    "colophon.xhtml": xhtml(
      'epub:type="colophon"',
      `<section><h2>Colophon</h2><p>Typeset for testing.</p></section>`,
    ),
  });
}

// --- No usable TOC: valid spine, no nav and no NCX (title fallback). ---
export function makeNoToc(): Uint8Array {
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Untitled Draft</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="a" href="chapter-a.xhtml" media-type="application/xhtml+xml"/>
    <item id="b" href="chapter-b.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="a"/>
    <itemref idref="b"/>
  </spine>
</package>`;
  return zip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": CONTAINER("content.opf"),
    "content.opf": opf,
    "chapter-a.xhtml": xhtml("", `<h1>Alpha</h1><p>Body of alpha.</p>`),
    "chapter-b.xhtml": xhtml("", `<p>A chapter with no heading at all.</p>`),
  });
}

// --- One chapter whose file is missing from the archive (contained fault). ---
export function makeBadChapter(): Uint8Array {
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Half a Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="good" href="good.xhtml" media-type="application/xhtml+xml"/>
    <item id="ghost" href="ghost.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="good"/>
    <itemref idref="ghost"/>
  </spine>
</package>`;
  return zip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": CONTAINER("content.opf"),
    "content.opf": opf,
    "good.xhtml": xhtml("", `<h1>Present</h1><p>This chapter is here.</p>`),
    // ghost.xhtml intentionally absent from the archive.
  });
}

// --- Valid ZIP but the OPF named by the container is absent. ---
export function makeMissingOpf(): Uint8Array {
  return zip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": CONTAINER("content.opf"),
    // content.opf intentionally absent.
    "chapter-1.xhtml": xhtml("", `<h1>Orphan</h1>`),
  });
}

// --- Valid OPF but an empty spine. ---
export function makeEmptySpine(): Uint8Array {
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Empty</dc:title></metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine></spine>
</package>`;
  return zip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": CONTAINER("content.opf"),
    "content.opf": opf,
    "c1.xhtml": xhtml("", `<h1>One</h1>`),
  });
}

// --- Not a ZIP at all. ---
export function makeNotAZip(): Uint8Array {
  return enc.encode("This is plainly not a zip archive, just some text bytes.");
}
