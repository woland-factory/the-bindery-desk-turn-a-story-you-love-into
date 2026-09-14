import type { CSSProperties } from "react";
import type { Document } from "../model/document";
import type { DesignSpec, Line, Page } from "../engine/types";
import { SOFT_HYPHEN } from "../engine/lineBreak";
import { pagePlacement } from "./pageGeometry";
import { resolveRunningHead } from "./runningHead";

// Renders one Page as a physical leaf: mirrored margins, running head and
// folio on body pages, the engine's laid-out lines in the text area, all in
// true design px and scaled to fit. Presentational and pure over its props;
// it never reads any page but its own, so it stays O(lines on this page).

interface Props {
  page: Page;
  design: DesignSpec;
  doc: Document;
  scale: number;
}

export function PageView({ page, design, doc, scale }: Props) {
  const p = pagePlacement(design, page.side);
  const isBody = page.kind === "body";

  // The wrapper takes the scaled footprint so scroll/flow math uses on-screen
  // pixels; the inner leaf keeps true design px and shrinks via transform.
  const wrapperStyle: CSSProperties = {
    width: p.pageWidthPx * scale,
    height: p.pageHeightPx * scale,
  };
  const leafStyle: CSSProperties = {
    width: p.pageWidthPx,
    height: p.pageHeightPx,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };

  const textAreaStyle: CSSProperties = {
    left: p.textLeftPx,
    top: p.textTopPx,
    width: p.columnPx,
    height: p.textHeightPx,
  };

  return (
    <div
      className="leaf"
      data-testid="page-leaf"
      data-kind={page.kind}
      data-side={page.side}
      style={wrapperStyle}
    >
      <div className="leaf__page" style={leafStyle}>
        {isBody && (
          <div
            className="leaf__chrome"
            style={{ left: p.textLeftPx, top: p.chromeBaselinePx, width: p.columnPx }}
          >
            <span className="leaf__runhead">{runHead(page, design, doc)}</span>
            <span className={`leaf__folio leaf__folio--${p.folioEdge}`}>{page.index + 1}</span>
          </div>
        )}
        <div className="leaf__text" data-testid="text-area" style={textAreaStyle}>
          {page.lines.map((line, i) => (
            <div
              key={i}
              className="leaf__line"
              style={{
                left: line.x,
                top: line.y,
                fontFamily: design.font.family,
                fontSize: p.fontSizePx,
                lineHeight: `${p.lineHeightPx}px`,
              }}
            >
              {displayText(line)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** An empty leaf outside the book (the left of the first spread). */
export function EmptyLeaf({ design, scale }: { design: DesignSpec; scale: number }) {
  const p = pagePlacement(design, "verso");
  return (
    <div
      className="leaf leaf--outside"
      data-testid="empty-leaf"
      aria-hidden="true"
      style={{ width: p.pageWidthPx * scale, height: p.pageHeightPx * scale }}
    />
  );
}

function runHead(page: Page, design: DesignSpec, doc: Document): string {
  const template = page.side === "verso" ? design.runningHeader.verso : design.runningHeader.recto;
  const chapter = doc.chapters.find((c) => c.order === page.chapterIndex)?.title ?? "";
  return resolveRunningHead(template, { title: doc.title, author: doc.author, chapter });
}

/** Show the inserted soft hyphen as a visible hyphen at the line end. */
function displayText(line: Line): string {
  const bare = line.text.split(SOFT_HYPHEN).join("");
  return line.hyphenated ? `${bare}-` : bare;
}
