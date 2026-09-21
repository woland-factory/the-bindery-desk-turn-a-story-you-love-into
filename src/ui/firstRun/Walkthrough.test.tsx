import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Walkthrough } from "./Walkthrough";
import { TOUR_STEPS } from "./steps";

function withTarget(anchor: string, step: number, handlers: { onNext?: () => void; onSkip?: () => void } = {}) {
  return render(
    <div>
      <button data-tour={anchor}>anchor</button>
      <Walkthrough step={step} onNext={handlers.onNext ?? (() => {})} onSkip={handlers.onSkip ?? (() => {})} />
    </div>,
  );
}

describe("Walkthrough", () => {
  it("shows step 1 text and a Skip control, with no Next", () => {
    withTarget("sample", 1);
    expect(screen.getByText("Open the sample to see a real book.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("shows Next on step 2 and advances on click", async () => {
    const onNext = vi.fn();
    withTarget("slider", 2, { onNext });
    expect(screen.getByText("Drag the slider to pick your sheet count.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("skips from any step", async () => {
    const onSkip = vi.fn();
    withTarget("export", 3, { onSkip });
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("hides until its target is in the DOM", () => {
    render(<Walkthrough step={1} onNext={() => {}} onSkip={() => {}} />);
    expect(screen.queryByText("Open the sample to see a real book.")).not.toBeInTheDocument();
  });

  it("has swept, human copy in its steps and controls", () => {
    const strings = [...TOUR_STEPS.map((s) => s.text), "Next", "Skip"];
    for (const s of strings) {
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/seamless|effortless|unlock|elevate|empower|leverage|robust|dive in/i);
      expect(s).not.toMatch(/You don't have|No .* yet|Nothing .* here|Unable to|Something went wrong/i);
    }
  });
});
