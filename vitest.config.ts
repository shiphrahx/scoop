import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test config for the pure domain logic (coach math, parsers, ranking,
// nutrients). Node environment by default; a test that needs the DOM opts in
// per-file with `// @vitest-environment jsdom`. The `@/` alias mirrors
// tsconfig so tests import the same way the app does.
export default defineConfig({
  // JSX for the component tests (the ones that drive the meal-building UI the
  // way a user does). esbuild compiles it with React's automatic runtime —
  // @vitejs/plugin-react is built against a newer vite than vitest ships, and
  // the tests need no fast-refresh.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Only the code that decides what a user eats and what they're told to
      // eat. UI components are covered by the end-to-end tests, not here.
      include: ["src/lib/**/*.ts", "src/app/**/actions.ts"],
      // Thin wrappers over Supabase/Anthropic clients: nothing to assert without
      // mocking the SDK itself, which tests the mock rather than our code.
      exclude: ["src/lib/supabase/**", "src/lib/log.ts"],
      // A ratchet, not a target: set just under where we are today, so coverage
      // can only go up. Raise it when you add tests. Lower it only when the
      // denominator genuinely changed (new code landing with its own untested
      // branches) — never to get a red build through.
      thresholds: {
        lines: 72,
        functions: 86,
        branches: 84,
        statements: 72,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
