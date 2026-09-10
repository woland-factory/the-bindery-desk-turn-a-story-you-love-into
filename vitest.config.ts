import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Test-runner config, kept out of tsc's project graph (see tsconfig.node.json)
// because vitest bundles its own vite copy whose plugin types clash with the
// app's. Vitest reads this file at runtime via esbuild, not tsc.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
