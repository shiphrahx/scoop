import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test config for the pure domain logic (coach math, parsers, ranking,
// nutrients). Node environment by default; a test that needs the DOM opts in
// per-file with `// @vitest-environment jsdom`. The `@/` alias mirrors
// tsconfig so tests import the same way the app does.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
