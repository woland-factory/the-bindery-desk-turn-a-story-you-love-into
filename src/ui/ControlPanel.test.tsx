import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import type { DesignSpec } from "../engine/types";

function setup(overrides: Partial<Parameters<typeof ControlPanel>[0]> = {}) {
  const onChange = vi.fn<(d: DesignSpec) => void>();
  const onReset = vi.fn();
  render(
    <ControlPanel design={DEFAULT_DESIGN} onChange={onChange} onReset={onReset} {...overrides} />,
  );
  return { onChange, onReset };
}

const last = (fn: ReturnType<typeof vi.fn>): DesignSpec => fn.mock.calls.at(-1)![0];

describe("ControlPanel dials emit the right patch", () => {
  it("changes the font family to a curated stack", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Font", { exact: true }), {
      target: { value: '"Lora", Georgia, serif' },
    });
    expect(last(onChange).font.family).toBe('"Lora", Georgia, serif');
  });

  it("changes the font size and re-derives leading", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/Font size/i), { target: { value: "14" } });
    expect(last(onChange).font.sizePt).toBe(14);
  });

  it("changes line spacing", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/Line spacing/i), { target: { value: "1.5" } });
    expect(last(onChange).font.lineHeightPt).toBe(Math.round(11 * 1.5 * 10) / 10);
  });

  it("sets a preset trim whole", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Page size"), { target: { value: "us-trade" } });
    expect(last(onChange).trim).toEqual({ w: 6, h: 9, unit: "in" });
  });

  it("reveals custom width, height, and units on Custom size", () => {
    setup();
    expect(screen.queryByLabelText(/Width/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Page size"), { target: { value: "custom" } });
    expect(screen.getByLabelText(/Width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Height/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Units")).toBeInTheDocument();
  });

  it("changes a margin", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/Inner/i), { target: { value: "1" } });
    expect(last(onChange).margins.inner).toBe(1);
  });

  it("changes the chapter opening drop", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Chapter opening"), { target: { value: "36" } });
    expect(last(onChange).chapterOpening.topDropPt).toBe(36);
  });

  it("toggles open-chapters-on-the-right", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText("Open chapters on the right"));
    expect(last(onChange).chapterOpening.startRecto).toBe(false);
  });

  it("changes a running header (render-only)", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Left page"), { target: { value: "" } });
    expect(last(onChange).runningHeader.verso).toBe("");
  });

  it("toggles widow control and hyphenation", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText("Widow and orphan control"));
    expect(last(onChange).widowControl).toBe(false);
    fireEvent.click(screen.getByLabelText("Hyphenation"));
    expect(last(onChange).hyphenation).toBe(false);
  });
});

describe("ControlPanel actions and a11y", () => {
  it("renders one disabled primary Export slot", () => {
    setup();
    const exportBtn = screen.getByRole("button", { name: "Export" });
    expect(exportBtn).toBeDisabled();
  });

  it("resets to defaults through the secondary action", () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("labels the panel region and every input", () => {
    setup();
    expect(screen.getByRole("region", { name: "Book design" })).toBeInTheDocument();
    for (const name of [
      "Page size",
      "Chapter opening",
      "Left page",
      "Right page",
      "Open chapters on the right",
      "Widow and orphan control",
      "Hyphenation",
    ]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
  });

  it("warms fonts when the Font control gains focus", () => {
    const onFontFocus = vi.fn();
    setup({ onFontFocus });
    fireEvent.focus(screen.getByLabelText("Font", { exact: true }));
    expect(onFontFocus).toHaveBeenCalled();
  });
});

describe("ControlPanel copy is swept", () => {
  it("uses no em-dashes, banned vocabulary, or negative phrasing", () => {
    const { container } = render(
      <ControlPanel design={DEFAULT_DESIGN} onChange={() => {}} onReset={() => {}} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/seamless|effortless|unlock|elevate|empower|leverage|robust|dive in/i);
    expect(text).not.toMatch(/You don't have|No .* yet|Nothing .* here|Unable to|Something went wrong/i);
  });
});
