import { describe, it, expect, vi, afterEach } from "vitest";
import { filenameSlug, pdfObjectUrl, saveBytes, saveText, settingsFilename } from "./download";

describe("filenameSlug", () => {
  it("lowercases and hyphenates a title, appending the suffix", () => {
    expect(filenameSlug("Middlemarch", "typeset")).toBe("middlemarch-typeset.pdf");
    expect(filenameSlug("The Wind in the Willows", "signatures")).toBe(
      "the-wind-in-the-willows-signatures.pdf",
    );
  });

  it("strips punctuation and collapses runs to a single hyphen", () => {
    expect(filenameSlug("  Aesop's Fables: A Selection!  ", "typeset")).toBe(
      "aesop-s-fables-a-selection-typeset.pdf",
    );
  });

  it("falls back to book when the title has no usable characters", () => {
    expect(filenameSlug("   ", "typeset")).toBe("book-typeset.pdf");
    expect(filenameSlug("©™", "signatures")).toBe("book-signatures.pdf");
  });

  it("never emits a space, em dash, or en dash", () => {
    const slug = filenameSlug("A — B – C", "typeset");
    expect(slug).not.toMatch(/[\s—–]/);
    expect(slug).toBe("a-b-c-typeset.pdf");
  });
});

describe("settingsFilename", () => {
  it("builds project and house-style filenames from the same slug logic", () => {
    expect(settingsFilename("Aesop's Fables", "project")).toBe("aesop-s-fables-project.json");
    expect(settingsFilename("Middlemarch", "housestyle")).toBe("middlemarch-housestyle.json");
  });

  it("falls back to book on an empty title", () => {
    expect(settingsFilename("   ", "project")).toBe("book-project.json");
  });
});

describe("saveText", () => {
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  afterEach(() => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it("builds an application/json blob and revokes the object URL", () => {
    let captured: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return "blob:mock";
    }) as typeof URL.createObjectURL;
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke as typeof URL.revokeObjectURL;

    saveText('{"a":1}', "book-project.json", "application/json");

    expect(captured).not.toBeNull();
    expect(captured!.type).toBe("application/json");
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });
});

describe("saveBytes", () => {
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  afterEach(() => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });

  it("builds an application/pdf blob and revokes the object URL", () => {
    let captured: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return "blob:mock";
    }) as typeof URL.createObjectURL;
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke as typeof URL.revokeObjectURL;

    saveBytes(new Uint8Array([1, 2, 3]), "middlemarch-typeset.pdf");

    expect(captured).not.toBeNull();
    expect(captured!.type).toBe("application/pdf");
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });

  it("pdfObjectUrl wraps bytes as a pdf blob", () => {
    let type = "";
    URL.createObjectURL = vi.fn((blob: Blob) => {
      type = blob.type;
      return "blob:mock";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    pdfObjectUrl(new Uint8Array([1]));
    expect(type).toBe("application/pdf");
  });
});
