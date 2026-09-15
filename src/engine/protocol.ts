// Worker message protocol. `load` is sent once per book; the worker holds
// the Document and re-paginates from a `paginate` (a changed design) alone,
// so a re-flow never re-transfers or re-parses the book.

import type { Document } from "../model/document";
import type { DesignSpec, Page, PaginationResult } from "./types";

/** Sent once per book. The Document crosses by structured clone. */
export interface LoadMessage {
  type: "load";
  requestId: number;
  document: Document;
}

/** The hot path. Runs against the held Document. Repeatable and cheap. */
export interface PaginateMessage {
  type: "paginate";
  requestId: number;
  design: DesignSpec;
}

/**
 * Ask the worker to load curated faces into its FontFaceSet ahead of need, so a
 * later paginate against one of them measures without a load stall. Fire and
 * forget: the worker sends no reply.
 */
export interface WarmFontsMessage {
  type: "warm-fonts";
  fontIds: string[];
}

export type MainToWorker = LoadMessage | PaginateMessage | WarmFontsMessage;

/** Acknowledges that the book is ingested and held; the hot path can start. */
export interface LoadedMessage {
  type: "loaded";
  requestId: number;
}

/** First-feedback and refinement: a cheap estimate plus the first real pages. */
export interface ProgressMessage {
  type: "progress";
  requestId: number;
  estimatedPageCount: number;
  firstPages: Page[];
}

/** The settled exact result. */
export interface DoneMessage {
  type: "done";
  requestId: number;
  result: PaginationResult;
  wordCount: number;
}

/** A product-voice, file-free message on failure. Never carries book text. */
export interface ErrorMessage {
  type: "error";
  requestId: number;
  message: string;
}

export type WorkerToMain = LoadedMessage | ProgressMessage | DoneMessage | ErrorMessage;
