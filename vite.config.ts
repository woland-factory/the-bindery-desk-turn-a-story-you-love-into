import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA. No backend. The sample EPUB and config.js live in public/.
export default defineConfig({
  plugins: [react()],
  build: {
    // EPUB parsing happens entirely client-side; keep the bundle lean.
    target: "es2021",
  },
});
