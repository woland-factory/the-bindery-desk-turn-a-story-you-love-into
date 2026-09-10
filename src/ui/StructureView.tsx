import { keptBlockCount, type Document } from "../model/document";
import type { ImportReport } from "../model/importReport";

interface Props {
  document: Document;
  report: ImportReport;
  onReset: () => void;
}

/**
 * Honest parsed structure: what the book is and what the parser kept. Not a
 * typeset preview (that arrives in a later EPIC). Renders one row per chapter
 * with a kept-block count, so it stays light even on a very long book.
 */
export function StructureView({ document, report, onReset }: Props) {
  return (
    <section className="structure" aria-labelledby="book-title">
      <div className="structure__top">
        <div>
          <h1 id="book-title" className="structure__title">
            {document.title}
          </h1>
          {byline(document) && <p className="structure__byline">{byline(document)}</p>}
        </div>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Open another book
        </button>
      </div>

      <p className="structure__summary">{reportSummary(report)}</p>

      {report.records.length > 0 && (
        <details className="report">
          <summary className="report__summary">Show what was set aside</summary>
          <ul className="report__list">
            {report.records.map((r, i) => (
              <li key={i} className="report__item">
                <span className="report__kind" data-kind={r.kind}>
                  {labelForKind(r.kind)}
                </span>
                <span className="report__where">{r.chapterTitle}</span>
                {r.detail && <span className="report__detail">{r.detail}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2 className="structure__subhead">
        {document.chapters.length} {plural(document.chapters.length, "chapter", "chapters")}
      </h2>
      <ol className="chapters">
        {document.chapters.map((c) => {
          const kept = keptBlockCount(c);
          return (
            <li key={c.id} className="chapter">
              <span className="chapter__order">{c.order + 1}</span>
              <span className="chapter__title">{c.title}</span>
              <span className="chapter__count">
                {kept} {plural(kept, "block", "blocks")}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function byline(doc: Document): string {
  return [doc.author, doc.language].filter(Boolean).join(" · ");
}

function reportSummary(report: ImportReport): string {
  const { headings, paragraphs, notes } = report.keptCounts;
  const { images, boilerplate } = report.droppedCounts;

  const keptParts = [
    `${paragraphs} ${plural(paragraphs, "paragraph", "paragraphs")}`,
    `${headings} ${plural(headings, "heading", "headings")}`,
  ];
  if (notes > 0) keptParts.push(`${notes} ${plural(notes, "note", "notes")}`);

  let out = `Kept ${joinList(keptParts)}.`;
  if (images > 0 || boilerplate > 0) {
    const setAside: string[] = [];
    if (images > 0) setAside.push(`${images} ${plural(images, "image", "images")}`);
    if (boilerplate > 0)
      setAside.push(`${boilerplate} extra ${plural(boilerplate, "section", "sections")}`);
    out += ` Set aside ${joinList(setAside)}.`;
  }
  return out;
}

function labelForKind(kind: ImportReport["records"][number]["kind"]): string {
  if (kind === "image") return "Image";
  if (kind === "boilerplate") return "Extra section";
  return "Note";
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
