import type { Line } from "../engine/types";
import { SOFT_HYPHEN } from "../engine/lineBreak";

// The single source of truth for the string a laid-out line renders as. The
// engine keeps the soft hyphen it broke on inside `line.text`; on screen and in
// the exported PDF we strip that invisible character and append a visible
// hyphen only when the line was actually broken. PageView calls this so the
// preview and the PDF draw byte-identical strings.

/** Show the inserted soft hyphen as a visible hyphen at the line end. */
export function displayLineText(line: Line): string {
  const bare = line.text.split(SOFT_HYPHEN).join("");
  return line.hyphenated ? `${bare}-` : bare;
}
