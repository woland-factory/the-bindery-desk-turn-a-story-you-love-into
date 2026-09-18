import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import { DEFAULT_DESIGN } from "../engine/defaultDesign";
import type { DesignSpec } from "../engine/types";
import type { ExportUiState } from "./BookPreview";

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
  it("disables Export before the first settled page and enables it after", () => {
    const { rerender } = render(
      <ControlPanel design={DEFAULT_DESIGN} onChange={() => {}} onReset={() => {}} canExport={false} />,
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    rerender(
      <ControlPanel design={DEFAULT_DESIGN} onChange={() => {}} onReset={() => {}} canExport={true} />,
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("fires the export callback once on click", () => {
    const onExport = vi.fn();
    render(
      <ControlPanel
        design={DEFAULT_DESIGN}
        onChange={() => {}}
        onReset={() => {}}
        canExport
        onExport={onExport}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("shows a phase-and-page progress label and marks the button busy while running", () => {
    render(
      <ControlPanel
        design={DEFAULT_DESIGN}
        onChange={() => {}}
        onReset={() => {}}
        canExport
        exportState={{ kind: "running", phase: "typeset", done: 240, total: 903 }}
      />,
    );
    const btn = screen.getByRole("button", { name: "Typesetting page 240 of 903" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("names the impose phase and confirms completion with save links", () => {
    const { rerender } = render(
      <ControlPanel
        design={DEFAULT_DESIGN}
        onChange={() => {}}
        onReset={() => {}}
        canExport
        exportState={{ kind: "running", phase: "impose", done: 4, total: 8 }}
      />,
    );
    expect(screen.getByRole("button", { name: "Building signatures" })).toBeInTheDocument();

    rerender(
      <ControlPanel
        design={DEFAULT_DESIGN}
        onChange={() => {}}
        onReset={() => {}}
        canExport
        exportState={{
          kind: "done",
          downloads: [
            { url: "blob:a", filename: "book-typeset.pdf", label: "Save typeset PDF" },
            { url: "blob:b", filename: "book-signatures.pdf", label: "Save signatures PDF" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Saved two files.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save typeset PDF" })).toHaveAttribute(
      "download",
      "book-typeset.pdf",
    );
    expect(screen.getByRole("link", { name: "Save signatures PDF" })).toBeInTheDocument();
  });

  it("shows the error state with a next step", () => {
    render(
      <ControlPanel
        design={DEFAULT_DESIGN}
        onChange={() => {}}
        onReset={() => {}}
        canExport
        exportState={{ kind: "error" }}
      />,
    );
    expect(
      screen.getByText("The export stopped before it finished. Try again."),
    ).toBeInTheDocument();
    // The button returns to its idle label, ready to retry.
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("defaults print setup to 4 sheets and Long edge, and fires change callbacks", () => {
    const onImposition = vi.fn();
    render(
      <ControlPanel
        design={DEFAULT_DESIGN}
        onChange={() => {}}
        onReset={() => {}}
        canExport
        onImposition={onImposition}
      />,
    );
    const sheets = screen.getByLabelText("Sheets per signature") as HTMLSelectElement;
    const flip = screen.getByLabelText("Duplex flip") as HTMLSelectElement;
    expect(sheets.value).toBe("4");
    expect(flip.value).toBe("long-edge");

    fireEvent.change(sheets, { target: { value: "2" } });
    expect(onImposition).toHaveBeenLastCalledWith({ sheetsPerSignature: 2, flip: "long-edge" });
    fireEvent.change(flip, { target: { value: "short-edge" } });
    expect(onImposition).toHaveBeenLastCalledWith({ sheetsPerSignature: 4, flip: "short-edge" });
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
  const states: ExportUiState[] = [
    { kind: "idle" },
    { kind: "running", phase: "typeset", done: 12, total: 40 },
    { kind: "running", phase: "impose", done: 2, total: 8 },
    {
      kind: "done",
      downloads: [
        { url: "blob:a", filename: "book-typeset.pdf", label: "Save typeset PDF" },
        { url: "blob:b", filename: "book-signatures.pdf", label: "Save signatures PDF" },
      ],
    },
    { kind: "error" },
  ];

  it("uses no em-dashes, banned vocabulary, or negative phrasing across every export state", () => {
    for (const exportState of states) {
      const { container, unmount } = render(
        <ControlPanel
          design={DEFAULT_DESIGN}
          onChange={() => {}}
          onReset={() => {}}
          canExport
          exportState={exportState}
        />,
      );
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/seamless|effortless|unlock|elevate|empower|leverage|robust|dive in/i);
      expect(text).not.toMatch(
        /You don't have|No .* yet|Nothing .* here|Unable to|Something went wrong/i,
      );
      unmount();
    }
  });
});
