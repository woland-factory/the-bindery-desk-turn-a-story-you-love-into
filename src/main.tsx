import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { readRuntimeConfig } from "./config/runtimeConfig";
import { initSentry } from "./integrations/sentry";
import { initUmami } from "./integrations/umami";

// Integrations read runtime config once. Both no-op when their config is
// absent, so the default build ships with zero tracking.
const config = readRuntimeConfig();
void initSentry(config);
initUmami(config);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
