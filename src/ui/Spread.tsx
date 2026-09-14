import type { Document } from "../model/document";
import type { DesignSpec } from "../engine/types";
import type { Spread as SpreadRow } from "./spreads";
import { PageView, EmptyLeaf } from "./PageView";

// Renders one display row: a facing pair (verso + recto) in spread mode, or a
// single leaf in single mode. A null slot is an empty leaf outside the book
// (the left of the very first spread). Pure over its props.

interface Props {
  row: SpreadRow;
  design: DesignSpec;
  doc: Document;
  scale: number;
}

export function Spread({ row, design, doc, scale }: Props) {
  return (
    <div className="spread" data-testid="spread">
      {row.map((page, i) =>
        page ? (
          <PageView key={page.index} page={page} design={design} doc={doc} scale={scale} />
        ) : (
          <EmptyLeaf key={`empty-${i}`} design={design} scale={scale} />
        ),
      )}
    </div>
  );
}
