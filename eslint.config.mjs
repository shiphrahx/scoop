import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The v8 HTML report, written by `npm run test:coverage`. Gitignored, but
    // eslint does not read .gitignore, so without this the SECOND run of
    // preflight:full lints the report the first run generated and fails on
    // vendored code nobody wrote.
    "coverage/**",
    // Claude's scratch worktrees, which are whole checkouts of this repo. Same
    // story as coverage: gitignored, invisible to eslint, and linting a second
    // copy of the codebase turned every push into a wall of errors from files
    // that are not the ones being pushed.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
