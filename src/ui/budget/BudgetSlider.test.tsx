import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetSlider, type Readout } from "./BudgetSlider";
import { DEFAULT_BOUNDS, type BudgetBounds } from "../../engine/budget";

const noop = () => {};

/** Open the Bounds disclosure the way a browser toggle does. */
function openBounds(container: HTMLElement) {
  const details = container.querySelector("details") as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

function renderSlider(overrides: Partial<Parameters<typeof BudgetSlider>[0]> = {}) {
  return render(
    <BudgetSlider
      min={40}
      max={80}
      value={52}
      disabled={false}
      solving={false}
      readout={{ kind: "settled", sheets: 52 }}
      bounds={DEFAULT_BOUNDS}
      onTarget={noop}
      onBounds={noop}
      {...overrides}
    />,
  );
}

/** A harness that commits targets the way Studio does (controlled value). */
function Harness({ onTarget }: { onTarget: (n: number) => void }) {
  const [value, setValue] = useState(52);
  return (
    <BudgetSlider
      min={40}
      max={80}
      value={value}
      disabled={false}
      solving={false}
      readout={{ kind: "settled", sheets: 52 }}
      bounds={DEFAULT_BOUNDS}
      onTarget={(n) => {
        setValue(n);
        onTarget(n);
      }}
      onBounds={noop}
    />
  );
}

describe("BudgetSlider control", () => {
  it("updates the thumb and the visible target in the same change event", () => {
    const onTarget = vi.fn();
    render(<Harness onTarget={onTarget} />);
    const slider = screen.getByLabelText("Fit into");

    fireEvent.change(slider, { target: { value: "47" } });

    expect(onTarget).toHaveBeenCalledWith(47);
    expect(slider).toHaveValue("47");
    expect(screen.getByText("47 sheets")).toBeInTheDocument();
  });

  it("commits keyboard steps (a change event per arrow) as integer sheet targets", () => {
    const onTarget = vi.fn();
    render(<Harness onTarget={onTarget} />);
    const slider = screen.getByLabelText("Fit into");
    // Native range arrows step the value and fire change; jsdom delivers the
    // same event shape.
    fireEvent.change(slider, { target: { value: "53" } });
    expect(onTarget).toHaveBeenLastCalledWith(53);
  });

  it("labels the slider and speaks the value in sheets", () => {
    renderSlider();
    const slider = screen.getByLabelText("Fit into");
    expect(slider).toHaveAttribute("aria-valuetext", "52 sheets");
    expect(slider).toHaveAttribute("min", "40");
    expect(slider).toHaveAttribute("max", "80");
    expect(slider).toHaveAttribute("step", "1");
  });

  it("is disabled before the first settle, with the laying-out readout", () => {
    renderSlider({ disabled: true, readout: { kind: "waiting" } });
    expect(screen.getByLabelText("Fit into")).toBeDisabled();
    expect(screen.getByText("Laying out your book")).toBeInTheDocument();
  });

  it("is disabled when the range collapses to a single value", () => {
    renderSlider({ min: 1, max: 1, value: 1 });
    expect(screen.getByLabelText("Fit into")).toBeDisabled();
  });
});

describe("BudgetSlider readout", () => {
  const variants: { readout: Readout; text: string }[] = [
    { readout: { kind: "settled", sheets: 52 }, text: "52 sheets · 13 signatures of 4 sheets" },
    { readout: { kind: "solving" }, text: "Fitting your book" },
    { readout: { kind: "closest", sheets: 54 }, text: "Closest inside your bounds: 54 sheets" },
    {
      readout: { kind: "clamped-dense", sheets: 61 },
      text: "Your bounds reach 61 sheets at the tightest. Loosen a bound to go lower.",
    },
    {
      readout: { kind: "clamped-roomy", sheets: 44 },
      text: "Your bounds reach 44 sheets at the roomiest. Loosen a bound to go higher.",
    },
    { readout: { kind: "waiting" }, text: "Laying out your book" },
  ];

  it.each(variants)("renders `$text` inside one polite live region", ({ readout, text }) => {
    const { container } = renderSlider({ readout });
    const regions = container.querySelectorAll("[aria-live]");
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAttribute("aria-live", "polite");
    expect(regions[0]).toHaveTextContent(text);
  });

  it("pluralizes a single sheet and signature", () => {
    renderSlider({ readout: { kind: "settled", sheets: 1 }, min: 1, max: 2, value: 1 });
    expect(screen.getByText("1 sheet · 1 signature of 4 sheets")).toBeInTheDocument();
  });
});

describe("BudgetSlider bounds", () => {
  it("shows six labeled inputs inside the Bounds disclosure", () => {
    const { container } = renderSlider();
    expect(container.querySelector("details > summary")).toHaveTextContent("Bounds");
    openBounds(container);
    for (const label of [
      "Font size min (pt)",
      "Font size max (pt)",
      "Line spacing min",
      "Line spacing max",
      "Margins min (%)",
      "Margins max (%)",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("clamps an edit to the rails before emitting", () => {
    const onBounds = vi.fn();
    const { container } = renderSlider({ onBounds });
    openBounds(container);
    fireEvent.change(screen.getByLabelText("Font size min (pt)"), { target: { value: "2" } });
    expect(onBounds).toHaveBeenCalledWith({ ...DEFAULT_BOUNDS, fontMinPt: 7 });
  });

  it("resolves a crossed pair by raising the max", () => {
    const onBounds = vi.fn();
    const { container } = renderSlider({ onBounds });
    openBounds(container);
    fireEvent.change(screen.getByLabelText("Font size min (pt)"), { target: { value: "15" } });
    expect(onBounds).toHaveBeenCalledWith({ ...DEFAULT_BOUNDS, fontMinPt: 15, fontMaxPt: 15 });
  });

  it("never emits values outside the rails across a sweep of junk edits", () => {
    const received: BudgetBounds[] = [];
    const { container } = renderSlider({ onBounds: (b) => received.push(b) });
    openBounds(container);
    const edits: [string, string][] = [
      ["Font size max (pt)", "99"],
      ["Line spacing min", "0.1"],
      ["Line spacing max", "9"],
      ["Margins min (%)", "1"],
      ["Margins max (%)", "999"],
    ];
    for (const [label, value] of edits) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    for (const b of received) {
      expect(b.fontMinPt).toBeGreaterThanOrEqual(7);
      expect(b.fontMaxPt).toBeLessThanOrEqual(18);
      expect(b.spacingMin).toBeGreaterThanOrEqual(1);
      expect(b.spacingMax).toBeLessThanOrEqual(2.5);
      expect(b.marginsMinPct).toBeGreaterThanOrEqual(50);
      expect(b.marginsMaxPct).toBeLessThanOrEqual(150);
      expect(b.fontMinPt).toBeLessThanOrEqual(b.fontMaxPt);
      expect(b.spacingMin).toBeLessThanOrEqual(b.spacingMax);
      expect(b.marginsMinPct).toBeLessThanOrEqual(b.marginsMaxPct);
    }
  });
});

describe("BudgetSlider copy sweep", () => {
  it("uses no em or en dashes, banned vocabulary, or negative phrasing in any state", () => {
    const readouts: Readout[] = [
      { kind: "waiting" },
      { kind: "solving" },
      { kind: "settled", sheets: 52 },
      { kind: "closest", sheets: 54 },
      { kind: "clamped-dense", sheets: 61 },
      { kind: "clamped-roomy", sheets: 44 },
    ];
    for (const readout of readouts) {
      const { container, unmount } = renderSlider({ readout });
      openBounds(container); // sweep the bound labels too
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(
        /seamless|effortless|unlock|elevate|empower|leverage|robust|dive in/i,
      );
      expect(text).not.toMatch(
        /You don't have|No .* yet|Nothing .* here|Unable to|Something went wrong/i,
      );
      unmount();
    }
  });
});
