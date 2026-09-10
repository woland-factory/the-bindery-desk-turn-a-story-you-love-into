import { parseEpub, type ParseResult } from "../epub/parseEpub";

/** Display name shown for the bundled sample. */
export const SAMPLE_NAME = "Aesop's Fables (sample)";

/** Path to the committed public-domain sample asset. */
export const SAMPLE_URL = "/sample/aesops-fables.epub";

/**
 * Fetch the bundled sample EPUB and parse it. This is the only fetch in the
 * app, and it reads an asset shipped inside the app itself. No user file is
 * ever sent anywhere.
 */
export async function loadSample(): Promise<ParseResult> {
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) throw new Error("The sample book could not be loaded.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  return parseEpub(bytes, SAMPLE_NAME);
}
