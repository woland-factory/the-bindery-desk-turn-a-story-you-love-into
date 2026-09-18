/// <reference lib="webworker" />
import { resolveExportFont } from "./fonts";
import { buildTypeset, buildSignatures } from "./pdf";
import { imposeBook } from "./impose";
import type { ExportRequest, ExportToMain } from "./protocol";

// The export worker. It receives one ExportRequest, fetches the embed font
// bytes same-origin, builds both PDFs with streamed progress, and transfers the
// two ArrayBuffers back. All pdf-lib work happens here, so the studio and the
// paper-budget slider stay live during an export. Latest-wins: a newer request
// supersedes an in-flight one, and the stale result is dropped before posting.

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let latest = 0;

const FAILED = "The export stopped before it finished. Try again.";

ctx.onmessage = async (event: MessageEvent<ExportRequest>) => {
  const req = event.data;
  latest = req.requestId;
  const post = (msg: ExportToMain) => ctx.postMessage(msg);

  try {
    const { regularUrl } = resolveExportFont(req.design);
    const res = await fetch(regularUrl);
    if (!res.ok) throw new Error("font fetch failed");
    const fontBytes = new Uint8Array(await res.arrayBuffer());

    const typesetDoc = await buildTypeset(
      req.result,
      req.design,
      req.docMeta,
      fontBytes,
      (done, total) => post({ type: "progress", requestId: req.requestId, phase: "typeset", done, total }),
    );
    if (req.requestId !== latest) return;
    const typeset = await typesetDoc.save();
    if (req.requestId !== latest) return;

    const plan = imposeBook(req.result.pageCount, req.imposition);
    const sigDoc = await buildSignatures(typesetDoc, plan, req.design, (done, total) =>
      post({ type: "progress", requestId: req.requestId, phase: "impose", done, total }),
    );
    if (req.requestId !== latest) return;
    const signatures = await sigDoc.save();
    if (req.requestId !== latest) return;

    const typesetBuf = toArrayBuffer(typeset);
    const signaturesBuf = toArrayBuffer(signatures);
    ctx.postMessage(
      { type: "done", requestId: req.requestId, typeset: typesetBuf, signatures: signaturesBuf },
      [typesetBuf, signaturesBuf],
    );
  } catch {
    // Never leak book text or the underlying error; a product-voice message.
    if (req.requestId === latest) {
      post({ type: "error", requestId: req.requestId, message: FAILED });
    }
  }
};

/** A tightly-sized ArrayBuffer for transfer (save() may over-allocate). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return bytes.slice().buffer;
}
