import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { ImportSurface } from "./ImportSurface";

describe("LoadingState", () => {
  it("holds the layout with a skeleton and a product-voice heading", () => {
    render(<LoadingState name="my-book.epub" />);
    expect(screen.getByRole("heading", { name: "Reading your book" })).toBeInTheDocument();
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
    expect(screen.getByText("my-book.epub")).toBeInTheDocument();
  });

  it("omits the filename for the sample load", () => {
    render(<LoadingState name="sample" />);
    expect(screen.queryByText("sample")).not.toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("names the problem and offers two recovery actions (unreadable)", () => {
    render(
      <ErrorState
        error={{ kind: "unreadable" }}
        maxMb={64}
        onChooseFile={() => {}}
        onOpenSample={() => {}}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This file is not a readable EPUB.");
    expect(alert).toHaveTextContent("Choose a valid .epub and try again.");
    expect(screen.getByRole("button", { name: "Try another file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the sample book" })).toBeInTheDocument();
  });

  it("states the size limit for an over-cap file", () => {
    render(
      <ErrorState
        error={{ kind: "too-large" }}
        maxMb={64}
        onChooseFile={() => {}}
        onOpenSample={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("larger than the 64 MB limit");
  });

  it("triggers the file chooser from the primary action", async () => {
    const onChooseFile = vi.fn();
    render(
      <ErrorState
        error={{ kind: "unreadable" }}
        maxMb={64}
        onChooseFile={onChooseFile}
        onOpenSample={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try another file" }));
    expect(onChooseFile).toHaveBeenCalledTimes(1);
  });
});

describe("ImportSurface (empty state)", () => {
  it("explains the product and offers one primary action plus the sample", async () => {
    const onChooseFile = vi.fn();
    const onOpenSample = vi.fn();
    render(
      <ImportSurface onFile={() => {}} onChooseFile={onChooseFile} onOpenSample={onOpenSample} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Open a book to begin" })).toBeVisible();
    expect(screen.getByText(/Your book stays on your computer\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Choose EPUB file" }));
    expect(onChooseFile).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Open the sample book" }));
    expect(onOpenSample).toHaveBeenCalledTimes(1);
  });
});
