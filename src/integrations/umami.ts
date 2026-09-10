// Privacy-respecting analytics, off unless both the script URL and website
// id are present at runtime. We load the Umami script for page-load counts
// only. No custom event ever carries a file name, title, or content.

import type { RuntimeConfig } from "../config/runtimeConfig";

/**
 * Inject the Umami script when configured. No-op when either value is
 * absent. Returns whether the script was injected (for tests). The script
 * is page-load tracking only; the app never calls umami.track with
 * file-derived data.
 */
export function initUmami(cfg: RuntimeConfig, doc: globalThis.Document = document): boolean {
  if (!cfg.umamiUrl || !cfg.umamiWebsiteId) return false;

  const script = doc.createElement("script");
  script.src = cfg.umamiUrl;
  script.defer = true;
  script.setAttribute("data-website-id", cfg.umamiWebsiteId);
  doc.head.appendChild(script);
  return true;
}
