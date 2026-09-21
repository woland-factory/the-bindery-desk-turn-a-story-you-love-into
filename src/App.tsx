import { useCallback, useEffect, useRef, useState } from "react";
import { parseEpub, MAX_EPUB_BYTES, type ParseResult } from "./epub/parseEpub";
import { isParseError } from "./epub/errors";
import type { Document } from "./model/document";
import type { ImportReport } from "./model/importReport";
import { loadSample } from "./sample/loadSample";
import { sourceId } from "./project/sourceId";
import type { EngineClientLike } from "./engine/client";
import type { ExportClientLike } from "./export/client";
import { ImportSurface } from "./ui/ImportSurface";
import { LoadingState } from "./ui/LoadingState";
import { ErrorState, type AppError } from "./ui/ErrorState";
import { Studio } from "./ui/Studio";
import { Walkthrough } from "./ui/firstRun/Walkthrough";
import { isFirstRunDone, markFirstRunDone } from "./ui/firstRun/persistFirstRun";

type State =
  | { status: "empty" }
  | { status: "loading"; name: string }
  | { status: "ready"; document: Document; report: ImportReport }
  | { status: "error"; error: AppError };

const MAX_MB = Math.round(MAX_EPUB_BYTES / (1024 * 1024));

interface Props {
  /** Injectable for tests; forwarded to the studio's preview. */
  createEngine?: () => EngineClientLike | null;
  /** Injectable for tests; forwarded to the studio's export client. */
  createExport?: () => ExportClientLike | null;
}

/** The guided-first-run position, or null when the tour is over/never shown. */
type Tour = { step: number } | null;

export default function App({ createEngine, createExport }: Props = {}) {
  const [state, setState] = useState<State>({ status: "empty" });
  // Show the tour only to a brand-new visitor; a returning user never sees it.
  const [tour, setTour] = useState<Tour>(() => (isFirstRunDone() ? null : { step: 1 }));
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
      void runImport(file.name, async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = parseEpub(bytes, file.name);
        // Attach the content hash after parsing, where the bytes are in hand.
        // Runs once per import, off the hot re-flow path.
        const sha256 = await sourceId(bytes);
        if (sha256) result.document.source.sha256 = sha256;
        return result;
      });
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

  // Step 1 -> 2 advances the moment a book loads (drop, file pick, or sample).
  useEffect(() => {
    if (tour?.step === 1 && state.status === "ready") setTour({ step: 2 });
  }, [tour, state.status]);

  const endTour = useCallback(() => {
    markFirstRunDone();
    setTour(null);
  }, []);

  // Step 2 -> 3 on the walkthrough's Next; the drag stays encouraged, not forced.
  const tourNext = useCallback(() => setTour((t) => (t ? { step: t.step + 1 } : t)), []);

  // The first export ends the tour, so it never shows after the first success.
  const onExportDone = useCallback(() => {
    setTour((t) => {
      if (!t) return null;
      markFirstRunDone();
      return null;
    });
  }, []);

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
        aria-label="Upload EPUB file"
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
          <Studio
            document={state.document}
            report={state.report}
            onReset={reset}
            createEngine={createEngine}
            createExport={createExport}
            onExportDone={onExportDone}
          />
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

      {tour && <Walkthrough step={tour.step} onNext={tourNext} onSkip={endTour} />}
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
