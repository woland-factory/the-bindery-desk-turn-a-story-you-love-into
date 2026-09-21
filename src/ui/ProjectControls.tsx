import { useRef } from "react";
import { readFileText } from "../project/projectIo";

// The save/open surface for project and house-style files. Visibly subordinate
// to Export: it lives behind one disclosure, styled as ghost actions, so it
// never competes with the primary action. Four labeled buttons and two hidden
// native file inputs (the same hidden-input-plus-button pattern as the EPUB
// import). One polite live region carries the current notice.

interface Props {
  onSaveProject: () => void;
  onSaveHouseStyle: () => void;
  /** Called with the opened file's text; the studio parses and applies it. */
  onOpenFile: (text: string) => void;
  /** The current save/open result, shown in the product's voice. */
  notice: string;
  /** Injectable for tests; defaults to reading the picked File to text. */
  readFile?: (file: File) => Promise<string>;
}

export function ProjectControls({
  onSaveProject,
  onSaveHouseStyle,
  onOpenFile,
  notice,
  readFile = readFileText,
}: Props) {
  const projectInputRef = useRef<HTMLInputElement>(null);
  const houseStyleInputRef = useRef<HTMLInputElement>(null);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void readFile(file).then(onOpenFile);
  };

  return (
    <details className="project">
      <summary>Project and presets</summary>
      <div className="project__body">
        <div className="project__actions">
          <button type="button" className="btn btn--ghost project__btn" onClick={onSaveProject}>
            Save project
          </button>
          <button
            type="button"
            className="btn btn--ghost project__btn"
            onClick={() => projectInputRef.current?.click()}
          >
            Open project
          </button>
          <button type="button" className="btn btn--ghost project__btn" onClick={onSaveHouseStyle}>
            Save house style
          </button>
          <button
            type="button"
            className="btn btn--ghost project__btn"
            onClick={() => houseStyleInputRef.current?.click()}
          >
            Apply house style
          </button>
        </div>

        <input
          ref={projectInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Open project file"
          tabIndex={-1}
          onChange={onInputChange}
        />
        <input
          ref={houseStyleInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Apply house style file"
          tabIndex={-1}
          onChange={onInputChange}
        />

        <p className="project__notice" role="status" aria-live="polite">
          {notice}
        </p>
      </div>
    </details>
  );
}
