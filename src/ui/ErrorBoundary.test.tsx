import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// A child that throws on render, to trip the boundary on demand.
function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

const EM_EN_DASH = /[—–]/;
const BANNED =
  /seamless|effortless|unlock|elevate|empower|leverage|robust|dive in|in today's fast-paced world|we've got you covered/i;
const NEGATIVE = /you don't have|no .* yet|nothing .* here|unable to|something went wrong/i;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("passes children through on a healthy render", () => {
    render(
      <ErrorBoundary>
        <p>the studio is fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("the studio is fine")).toBeInTheDocument();
    // No fallback surface on a healthy session.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a designed fallback with a recovery action when a child throws", () => {
    // React logs the caught error to console.error; silence it for a clean run.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom message="internal-stack-detail-xyz" />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The studio needs a restart.");
    expect(alert).toHaveTextContent("Reload to open your book again.");
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument();

    // No stack trace or error message leaks into the UI.
    expect(document.body.textContent).not.toContain("internal-stack-detail-xyz");
    expect(document.body.textContent).not.toContain("Error");
  });

  it("has swept, human fallback copy", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Boom message="boom" />
      </ErrorBoundary>,
    );
    for (const el of container.querySelectorAll("h1, p, button")) {
      const text = el.textContent ?? "";
      expect(text).not.toMatch(EM_EN_DASH);
      expect(text).not.toMatch(BANNED);
      expect(text).not.toMatch(NEGATIVE);
    }
  });
});
