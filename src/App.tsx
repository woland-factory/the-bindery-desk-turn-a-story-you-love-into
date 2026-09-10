import { useCallback, useRef, useState } from "react";
import { parseEpub, MAX_EPUB_BYTES, type ParseResult } from "./epub/parseEpub";
import { isParseError } from "./epub/errors";
import type { Document } from "./model/document";
import type { ImportReport } from "./model/importReport";
import { loadSample } from "./sample/loadSample";
import { ImportSurface } from "./ui/ImportSurface";
import { LoadingState } from "./ui/LoadingState";
import { ErrorState, type AppError } from "./ui/ErrorState";
import { StructureView } from "./ui/StructureView";

type State =
  | { status: "empty" }
  | { status: "loading"; name: string }
  | { status: "ready"; document: Document; report: ImportReport }
  | { status: "error"; error: AppError };

const MAX_MB = Math.round(MAX_EPUB_BYTES / (1024 * 1024));

export default function App() {
  const [state, setState] = useState<State>({ status: "empty" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFileDialog = useCallback(() => fileInputRef.current?.click(), []);

  const runImport = useCallback(async (name: string, produce: () => Promise<ParseResult>) => {
    setState({ status: "loading", name });
    // Yield a frame so the loading skeleton paints before the synchronous
    // parse runs. Keeps first feedback well under the perceived-speed bar.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const { document, report } = await produce();
      setState({ status: "ready", document, report });
    } catch (err) {
      setState({ status: "error", error: toAppError(err) });
    }
  }, []);

  const onFile = useCallback(
    (file: File) => {
      if (!looksLikeEpub(file)) {
        setState({ status: "error", error: { kind: "unreadable" } });
        return;
      }
      void runImport(file.name, async () =>
        parseEpub(new Uint8Array(await file.arrayBuffer()), file.name),
      );
    },
    [runImport],
  );

  const onOpenSample = useCallback(() => {
    void runImport("sample", () => loadSample());
  }, [runImport]);

  const reset = useCallback(() => setState({ status: "empty" }), []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  };

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__mark" aria-hidden="true">
          ▤
        </span>
        <span className="app__title">The Bindery Desk</span>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="visually-hidden"
        aria-label="Choose EPUB file"
        tabIndex={-1}
        onChange={onInputChange}
      />

      <main className="app__main" id="main">
        {state.status === "empty" && (
          <ImportSurface
            onFile={onFile}
            onChooseFile={openFileDialog}
            onOpenSample={onOpenSample}
          />
        )}
        {state.status === "loading" && <LoadingState name={state.name} />}
        {state.status === "ready" && (
          <StructureView document={state.document} report={state.report} onReset={reset} />
        )}
        {state.status === "error" && (
          <ErrorState
            error={state.error}
            maxMb={MAX_MB}
            onChooseFile={openFileDialog}
            onOpenSample={onOpenSample}
          />
        )}
      </main>
    </div>
  );
}

function looksLikeEpub(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".epub") || file.type === "application/epub+zip";
}

function toAppError(err: unknown): AppError {
  if (isParseError(err)) {
    return err.code === "too-large" ? { kind: "too-large" } : { kind: "unreadable" };
  }
  // A failed sample fetch is the only other path here.
  return { kind: "sample-failed" };
}
