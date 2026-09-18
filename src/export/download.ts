// Main-thread save helpers. The worker hands back two ArrayBuffers; these turn
// them into browser downloads and into the visible fallback links. No network,
// no upload: a Blob object URL is same-document and never leaves the tab.

/** A book title to a safe file slug: lowercase, [a-z0-9] runs joined by "-". */
export function filenameSlug(title: string, suffix: "typeset" | "signatures"): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "book"}-${suffix}.pdf`;
}

/** Wrap bytes in a PDF Blob and return an object URL. The caller revokes it. */
export function pdfObjectUrl(bytes: ArrayBuffer | Uint8Array): string {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

/** Click a transient anchor to save `url` as `filename`. */
export function triggerDownload(url: string, filename: string): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Build a PDF Blob, save it once, and revoke its URL. */
export function saveBytes(bytes: ArrayBuffer | Uint8Array, filename: string): void {
  const url = pdfObjectUrl(bytes);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}
