import { describe, it, expect } from "vitest";
import { resolveRunningHead } from "./runningHead";

const ctx = { title: "Middlemarch", author: "George Eliot", chapter: "Prelude" };

describe("resolveRunningHead", () => {
  it("substitutes each known token", () => {
    expect(resolveRunningHead("{author}", ctx)).toBe("George Eliot");
    expect(resolveRunningHead("{title}", ctx)).toBe("Middlemarch");
    expect(resolveRunningHead("{chapter}", ctx)).toBe("Prelude");
  });

  it("substitutes multiple tokens in one template", () => {
    expect(resolveRunningHead("{author}, {title}", ctx)).toBe("George Eliot, Middlemarch");
  });

  it("leaves an unknown token literal", () => {
    expect(resolveRunningHead("{folio}", ctx)).toBe("{folio}");
  });

  it("returns an empty string for an empty template", () => {
    expect(resolveRunningHead("", ctx)).toBe("");
  });
});
