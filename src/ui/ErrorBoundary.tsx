import { Component, type ErrorInfo, type ReactNode } from "react";

// The app-level safety net. On a healthy session it renders nothing of its own,
// it just passes children through. If an unexpected render throws anywhere below
// it, React unmounts that tree and this shows a designed, product-voice screen
// with a recovery action instead of a blank or broken page (QUALITY BAR §3).
// The book never leaves the browser, so a crash is a reload away from working.

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Forward to Sentry only when it was actually initialized (a DSN was
    // configured at runtime). When it was not, stay silent and load no tracking
    // code. Sentry's own scrubbing keeps file-derived text out of the report.
    if (typeof window !== "undefined" && (window as { __SENTRY__?: unknown }).__SENTRY__) {
      void import("@sentry/react")
        .then((sentry) => sentry.captureException(error))
        .catch(() => {});
    }
  }

  private handleReload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;

    return (
      <div className="app">
        <header className="app__header">
          <span className="app__mark" aria-hidden="true">
            ▤
          </span>
          <span className="app__title">The Bindery Desk</span>
        </header>
        <main className="app__main" id="main">
          <section className="surface" role="alert" aria-labelledby="crash-heading">
            <div className="surface__panel surface__panel--error">
              <h1 id="crash-heading" className="surface__heading">
                The studio needs a restart.
              </h1>
              <p className="surface__body">
                Reload to open your book again. Your file stayed on your computer.
              </p>
              <div className="surface__actions">
                <button type="button" className="btn btn--primary" onClick={this.handleReload}>
                  Start over
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }
}
