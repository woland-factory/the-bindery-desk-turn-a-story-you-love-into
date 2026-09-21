import { saveText, settingsFilename } from "../export/download";
import type { HouseStyle, ProjectFile } from "./projectFile";

// Main-thread IO for project and house-style files. Saving is a browser
// download (a same-document Blob URL that never leaves the tab); opening reads
// a local file the user picked. No network, no upload.

const PRETTY = 2;

/** Serialize and download a project file as `<slug>-project.json`. */
export function saveProject(project: ProjectFile, title: string): void {
  saveText(JSON.stringify(project, null, PRETTY), settingsFilename(title, "project"), "application/json");
}

/** Serialize and download a house-style file as `<slug>-housestyle.json`. */
export function saveHouseStyle(style: HouseStyle, title: string): void {
  saveText(
    JSON.stringify(style, null, PRETTY),
    settingsFilename(title, "housestyle"),
    "application/json",
  );
}

/** Read a picked File to text, with an arrayBuffer fallback for older engines. */
export async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  const buffer = await file.arrayBuffer();
  return new TextDecoder().decode(new Uint8Array(buffer));
}
