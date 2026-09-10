// Runtime configuration, read from window.__BINDERY_CONFIG__ which is set by
// /config.js before the app bundle loads. In the container that file is
// generated from env at startup, so one build works across environments and
// no secret ever enters the bundle or git. Missing object -> all empty.

export interface RuntimeConfig {
  sentryDsn: string;
  umamiUrl: string;
  umamiWebsiteId: string;
}

declare global {
  interface Window {
    __BINDERY_CONFIG__?: Partial<RuntimeConfig>;
  }
}

export function readRuntimeConfig(): RuntimeConfig {
  const raw = typeof window !== "undefined" ? window.__BINDERY_CONFIG__ : undefined;
  return {
    sentryDsn: str(raw?.sentryDsn),
    umamiUrl: str(raw?.umamiUrl),
    umamiWebsiteId: str(raw?.umamiWebsiteId),
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
