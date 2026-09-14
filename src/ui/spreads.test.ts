import { describe, it, expect } from "vitest";
import { groupSpreads } from "./spreads";
import type { Page } from "../engine/types";

function page(index: number): Page {
  return {
    index,
    side: index % 2 === 0 ? "recto" : "verso",
    kind: "body",
    chapterIndex: 0,
    lines: [],
  };
}

describe("groupSpreads (spread mode)", () => {
  it("opens with a leading half-spread: [null, page0]", () => {
    const spreads = groupSpreads([page(0), page(1), page(2)], "spread");
    expect(spreads[0][0]).toBeNull();
    expect(spreads[0][1]?.index).toBe(0);
  });

  it("pairs verso/recto after the first spread", () => {
    const spreads = groupSpreads([page(0), page(1), page(2)], "spread");
    expect(spreads[1][0]?.index).toBe(1); // verso
    expect(spreads[1][1]?.index).toBe(2); // recto
    expect(spreads).toHaveLength(2);
  });

  it("fills a trailing missing recto with an empty leaf", () => {
    const spreads = groupSpreads([page(0), page(1)], "spread");
    expect(spreads[1][0]?.index).toBe(1);
    expect(spreads[1][1]).toBeNull();
  });

  it("returns no spreads for an empty book", () => {
    expect(groupSpreads([], "spread")).toEqual([]);
  });
});

describe("groupSpreads (single mode)", () => {
  it("gives one row per page in index order", () => {
    const spreads = groupSpreads([page(0), page(1), page(2)], "single");
    expect(spreads).toHaveLength(3);
    expect(spreads.map((row) => row[0]?.index)).toEqual([0, 1, 2]);
  });
});
