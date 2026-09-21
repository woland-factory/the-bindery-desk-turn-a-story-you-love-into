import { describe, it, expect, vi } from "vitest";

const { saveText } = vi.hoisted(() => ({ saveText: vi.fn() }));
vi.mock("../export/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../export/download")>();
  return { ...actual, saveText };
});

import { saveProject, saveHouseStyle, readFileText } from "./projectIo";
import { buildProject, buildHouseStyle, type SourceRef } from "./projectFile";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import { DEFAULT_BOUNDS } from "../engine/budget";
import { DEFAULT_IMPOSITION } from "../export/impose";

const source: SourceRef = { name: "n.epub", byteLength: 1 };

describe("projectIo saving", () => {
  it("saves a project as pretty JSON with a project filename", () => {
    saveText.mockClear();
    const file = buildProject(source, DEFAULT_DESIGN, DEFAULT_BOUNDS, DEFAULT_IMPOSITION);
    saveProject(file, "The Wind in the Willows");
    expect(saveText).toHaveBeenCalledTimes(1);
    const [text, filename, mime] = saveText.mock.calls[0];
    expect(filename).toBe("the-wind-in-the-willows-project.json");
    expect(mime).toBe("application/json");
    expect(text).toContain('\n  "kind": "bindery-project"');
    expect(JSON.parse(text)).toEqual(file);
  });

  it("saves a house style with a housestyle filename", () => {
    saveText.mockClear();
    const style = buildHouseStyle(DEFAULT_DESIGN, DEFAULT_BOUNDS, DEFAULT_IMPOSITION);
    saveHouseStyle(style, "Middlemarch");
    const [, filename] = saveText.mock.calls[0];
    expect(filename).toBe("middlemarch-housestyle.json");
  });

  it("falls back to book when the title has no usable characters", () => {
    saveText.mockClear();
    saveProject(buildProject(source, DEFAULT_DESIGN, DEFAULT_BOUNDS, DEFAULT_IMPOSITION), "   ");
    expect(saveText.mock.calls[0][1]).toBe("book-project.json");
  });
});

describe("readFileText", () => {
  it("reads a File to text", async () => {
    const file = new File(['{"kind":"bindery-project"}'], "p.json", { type: "application/json" });
    expect(await readFileText(file)).toBe('{"kind":"bindery-project"}');
  });
});
