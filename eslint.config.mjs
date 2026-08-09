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
  ]),
]);

export default eslintConfig;
