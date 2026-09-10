// Builds the bundled sample EPUB under public/sample/. The text is Aesop's
// Fables in the George Fyler Townsend translation (1887), which is in the
// public domain worldwide and freely redistributable. Run with:
//   node scripts/makeSample.mjs
// The produced .epub is committed so the app ships a one-tap sample.

import { zipSync } from "fflate";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const enc = new TextEncoder();
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "sample");

const page = (title, body) => enc.encode(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title></head>
<body>${body}</body>
</html>`);

const fables = [
  {
    id: "tortoise",
    title: "The Hare and the Tortoise",
    body: `<p>A Hare one day ridiculed the short feet and slow pace of the Tortoise, who replied, laughing: "Though you be swift as the wind, I will beat you in a race."</p>
      <p>The Hare, believing her assertion to be simply impossible, assented to the proposal; and they agreed that the Fox should choose the course and fix the goal.</p>
      <p>On the day appointed for the race the two started together. The Tortoise never for a moment stopped, but went on with a slow but steady pace straight to the end of the course.</p>
      <p>The Hare, lying down by the wayside, fell fast asleep. At last waking up, and moving as fast as he could, he saw the Tortoise had reached the goal, and was comfortably dozing after her fatigue.</p>
      <p>Slow but steady wins the race.</p>`,
  },
  {
    id: "ant",
    title: "The Ant and the Grasshopper",
    body: `<p>The Ants were spending a fine winter's day drying grain collected in the summertime. A Grasshopper, perishing with famine, passed by and earnestly begged for a little food.</p>
      <p>The Ants inquired of him, "Why did you not treasure up food during the summer?" He replied, "I had not leisure enough. I passed the days in singing."</p>
      <p>They then said in derision: "If you were foolish enough to sing all the summer, you must dance supperless to bed in the winter."</p>`,
  },
  {
    id: "lion",
    title: "The Lion and the Mouse",
    body: `<p>A Lion was awakened from sleep by a Mouse running over his face. Rising up angrily, he caught him and was about to kill him, when the Mouse piteously entreated, saying:</p>
      <p>"If you would only spare my life, I would be sure to repay your kindness." The Lion laughed and let him go.</p>
      <p>It happened shortly after this that the Lion was caught by some hunters, who bound him by strong ropes to the ground. The Mouse, recognizing his roar, came and gnawed the rope with his teeth, and set him free, exclaiming:</p>
      <p>"You ridiculed the idea of my ever being able to help you, not expecting to receive from me any repayment of your favor; now you know that it is possible for even a Mouse to confer benefits on a Lion."</p>`,
  },
  {
    id: "crow",
    title: "The Crow and the Pitcher",
    body: `<p>A Crow perishing with thirst saw a pitcher, and hoping to find water, flew to it with delight. When he reached it, he discovered to his grief that it contained so little water that he could not possibly get at it.</p>
      <p>He tried everything he could think of to reach the water, but all his efforts were in vain. At last he collected as many stones as he could carry and dropped them one by one with his beak into the pitcher, until he brought the water within his reach and thus saved his life.</p>
      <p>Necessity is the mother of invention.</p>`,
  },
];

const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">bindery-sample-aesop</dc:identifier>
    <dc:title>Aesop's Fables: A Small Selection</dc:title>
    <dc:creator>Aesop</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>
${fables.map((f) => `    <item id="${f.id}" href="${f.id}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
  </manifest>
  <spine>
    <itemref idref="titlepage"/>
${fables.map((f) => `    <itemref idref="${f.id}"/>`).join("\n")}
  </spine>
</package>`;

const nav = page(
  "Contents",
  `<nav epub:type="toc"><h1>Contents</h1><ol>
${fables.map((f) => `    <li><a href="${f.id}.xhtml">${f.title}</a></li>`).join("\n")}
  </ol></nav>`,
);

const files = {
  mimetype: enc.encode("application/epub+zip"),
  "META-INF/container.xml": enc.encode(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
  "OEBPS/content.opf": enc.encode(opf),
  "OEBPS/nav.xhtml": nav,
  "OEBPS/titlepage.xhtml": page(
    "Aesop's Fables",
    `<h1>Aesop's Fables</h1><p>A Small Selection</p><p>Translated by George Fyler Townsend</p>`,
  ),
};
for (const f of fables) {
  files[`OEBPS/${f.id}.xhtml`] = page(f.title, `<h2>${f.title}</h2>${f.body}`);
}

const out = zipSync(files, { level: 6 });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "aesops-fables.epub"), out);
console.log(`Wrote ${outDir}/aesops-fables.epub (${out.length} bytes)`);
