import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // e2e specs run under Playwright, never Vitest.
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
