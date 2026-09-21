import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectControls } from "./ProjectControls";

function setup(overrides: Partial<Parameters<typeof ProjectControls>[0]> = {}) {
  const props = {
    onSaveProject: vi.fn(),
    onSaveHouseStyle: vi.fn(),
    onOpenFile: vi.fn(),
    notice: "",
    ...overrides,
  };
  render(<ProjectControls {...props} />);
  return props;
}

const BUTTONS = ["Save project", "Open project", "Save house style", "Apply house style"];

describe("ProjectControls", () => {
  it("shows a disclosure with four labeled, subordinate buttons", () => {
    setup();
    expect(screen.getByText("Project and presets")).toBeInTheDocument();
    for (const name of BUTTONS) {
      const button = screen.getByRole("button", { name });
      // Ghost styling keeps every action visibly subordinate to Export.
      expect(button).toHaveClass("btn--ghost");
      expect(button).not.toHaveClass("btn--primary");
    }
  });

  it("calls the save handlers on click", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    expect(props.onSaveProject).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save house style" }));
    expect(props.onSaveHouseStyle).toHaveBeenCalledTimes(1);
  });

  it("reads a picked project file and hands its text up", async () => {
    const readFile = vi.fn(async () => '{"kind":"bindery-project"}');
    const props = setup({ readFile });
    const input = screen.getByLabelText("Open project file");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "p.json", { type: "application/json" })] },
    });
    await waitFor(() => expect(props.onOpenFile).toHaveBeenCalledWith('{"kind":"bindery-project"}'));
  });

  it("reads a picked house-style file and hands its text up", async () => {
    const readFile = vi.fn(async () => '{"kind":"bindery-housestyle"}');
    const props = setup({ readFile });
    const input = screen.getByLabelText("Apply house style file");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "h.json", { type: "application/json" })] },
    });
    await waitFor(() =>
      expect(props.onOpenFile).toHaveBeenCalledWith('{"kind":"bindery-housestyle"}'),
    );
  });

  it("shows the notice in a polite live region", () => {
    setup({ notice: "Project loaded." });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Project loaded.");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("has no em/en dash, banned vocabulary, or negative empty-state copy", () => {
    const { container } = render(
      <ProjectControls
        onSaveProject={() => {}}
        onSaveHouseStyle={() => {}}
        onOpenFile={() => {}}
        notice="This file did not load. Choose a project or house style saved here."
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(
      /seamless|effortless|unlock|elevate|empower|leverage|robust|dive in/i,
    );
    expect(text).not.toMatch(/You don't have|No .* yet|Nothing .* here|Unable to|Something went wrong/i);
  });
});
