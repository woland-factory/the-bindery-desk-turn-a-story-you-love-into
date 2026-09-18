import type { DesignSpec, PaginationResult } from "../engine/types";
import type { ImpositionOptions } from "./impose";

// Message protocol for the export worker. The settled PaginationResult and the
// small DocMeta cross by structured clone, one time per export. No book text
// beyond chapter titles ever travels in metadata; the page text is already in
// the result the preview settled on. The two finished PDFs travel back as
// transferred ArrayBuffers, so the bytes are moved, never copied.

/** The few book-data strings the PDF's running heads need. No body text. */
export interface DocMeta {
  title: string;
  author: string;
  /** Chapter title keyed by `Chapter.order`, for running heads. */
  chapterTitles: Record<number, string>;
}

/** Main -> worker: build both PDFs for this settled result. */
export interface ExportRequest {
  requestId: number;
  result: PaginationResult;
  design: DesignSpec;
  docMeta: DocMeta;
  imposition: ImpositionOptions;
}

export type ExportPhase = "typeset" | "impose";

/** Worker -> main: streamed progress within a phase. */
export interface ExportProgress {
  type: "progress";
  requestId: number;
  phase: ExportPhase;
  done: number;
  total: number;
}

/** Worker -> main: both files, as transferred ArrayBuffers. */
export interface ExportDone {
  type: "done";
  requestId: number;
  typeset: ArrayBuffer;
  signatures: ArrayBuffer;
}

/** Worker -> main: a product-voice, file-free failure. Never carries book text. */
export interface ExportError {
  type: "error";
  requestId: number;
  message: string;
}

export type ExportToWorker = ExportRequest;
export type ExportToMain = ExportProgress | ExportDone | ExportError;
