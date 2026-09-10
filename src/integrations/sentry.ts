// Error tracking, off unless a DSN is present at runtime. The binding
// privacy norm is enforced here in code: nothing file-derived (file name,
// book title, author, chapter text) may ever leave the browser. We scrub
// aggressively and disable default PII.
//
// @sentry/react is loaded dynamically, so the default (no-DSN) build never
// ships it in the first-render chunk. This keeps first paint fast.

import type { init as SentryInit } from "@sentry/react";
import type { RuntimeConfig } from "../config/runtimeConfig";

export interface SentryClient {
  init: typeof SentryInit;
}

type Loader = () => Promise<SentryClient>;

const defaultLoader: Loader = () => import("@sentry/react");

/**
 * Initialize Sentry when a DSN is configured. No-op when absent, so the app
 * works with zero tracking by default. `beforeSend` strips request data,
 * breadcrumbs, and user info so no file-derived value is ever transmitted.
 * Returns whether tracking was initialized.
 */
export async function initSentry(
  cfg: RuntimeConfig,
  loader: Loader = defaultLoader,
): Promise<boolean> {
  if (!cfg.sentryDsn) return false;

  const client = await loader();
  client.init({
    dsn: cfg.sentryDsn,
    sendDefaultPii: false,
    // Keep traces/replays off: this is a single-file client tool, not a
    // service, and sampling user sessions risks capturing book content.
    beforeBreadcrumb: () => null,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      delete event.breadcrumbs;
      if (event.extra) event.extra = {};
      if (event.contexts) delete event.contexts.state;
      return event;
    },
  });
  return true;
}
