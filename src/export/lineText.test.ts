import { describe, it, expect } from "vitest";
import type { Line } from "../engine/types";
import { SOFT_HYPHEN } from "../engine/lineBreak";
import { displayLineText } from "./lineText";

function line(text: string, hyphenated: boolean): Line {
  return { text, x: 0, y: 0, width: 100, hyphenated };
}

describe("displayLineText", () => {
  it("returns a plain line unchanged", () => {
    expect(displayLineText(line("The quick brown fox", false))).toBe("The quick brown fox");
  });

  it("strips an inserted soft hyphen and appends a visible hyphen when broken", () => {
    expect(displayLineText(line(`compli${SOFT_HYPHEN}`, true))).toBe("compli-");
  });

  it("strips a soft hyphen without adding one when the flag is off", () => {
    // A soft hyphen mid-string is invisible on screen; the flag alone adds the
    // visible one, so an unbroken line never shows a stray hyphen.
    expect(displayLineText(line(`co${SOFT_HYPHEN}op`, false))).toBe("coop");
  });

  it("matches the rule PageView rendered before the extraction", () => {
    // Snapshot the two branches the preview relied on, byte for byte.
    expect(displayLineText(line("plain", false))).toBe("plain");
    expect(displayLineText(line(`word${SOFT_HYPHEN}`, true))).toBe("word-");
  });
});
