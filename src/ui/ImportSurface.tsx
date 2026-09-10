import { useCallback, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  onChooseFile: () => void;
  onOpenSample: () => void;
}

/**
 * The first screen. A dropzone that doubles as the empty state: it says what
 * the product does and offers one obvious action (choose an EPUB) with the
 * sample as a visibly subordinate second action. Owns drag-and-drop and
 * hands dropped files up; the file picker lives in the parent.
 */
export function ImportSurface({ onFile, onChooseFile, onOpenSample }: Props) {
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <section className="surface" aria-labelledby="empty-heading">
      <div
        className={`dropzone${dragging ? " dropzone--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="dropzone"
      >
        <h1 id="empty-heading" className="surface__heading">
          Open a book to begin
        </h1>
        <p className="surface__body">
          Drop an EPUB here or choose a file. Your book stays on your computer.
        </p>
        <div className="surface__actions">
          <button type="button" className="btn btn--primary" onClick={onChooseFile}>
            Choose EPUB file
          </button>
          <button type="button" className="btn btn--ghost" onClick={onOpenSample}>
            Open the sample book
          </button>
        </div>
      </div>
    </section>
  );
}
