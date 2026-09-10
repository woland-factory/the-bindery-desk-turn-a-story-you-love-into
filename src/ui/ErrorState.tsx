export type AppError = { kind: "unreadable" } | { kind: "too-large" } | { kind: "sample-failed" };

interface Props {
  error: AppError;
  maxMb: number;
  onChooseFile: () => void;
  onOpenSample: () => void;
}

/**
 * Designed error surface. Speaks in the product's voice and always offers a
 * next step. Never shows a stack trace or error code.
 */
export function ErrorState({ error, maxMb, onChooseFile, onOpenSample }: Props) {
  const { heading, body } = messageFor(error, maxMb);
  return (
    <section className="surface" role="alert" aria-labelledby="error-heading">
      <div className="surface__panel surface__panel--error">
        <h1 id="error-heading" className="surface__heading">
          {heading}
        </h1>
        <p className="surface__body">{body}</p>
        <div className="surface__actions">
          <button type="button" className="btn btn--primary" onClick={onChooseFile}>
            Try another file
          </button>
          <button type="button" className="btn btn--ghost" onClick={onOpenSample}>
            Open the sample book
          </button>
        </div>
      </div>
    </section>
  );
}

function messageFor(error: AppError, maxMb: number): { heading: string; body: string } {
  switch (error.kind) {
    case "too-large":
      return {
        heading: `This file is larger than the ${maxMb} MB limit.`,
        body: "Choose a smaller EPUB.",
      };
    case "sample-failed":
      return {
        heading: "Try opening the sample again.",
        body: "Check your connection, then open the sample once more.",
      };
    case "unreadable":
    default:
      return {
        heading: "This file is not a readable EPUB.",
        body: "Choose a valid .epub and try again.",
      };
  }
}
