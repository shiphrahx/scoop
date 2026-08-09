// Fail if an em dash or en dash has crept back into the project.
//
// Not a style nit: the owner asked for them gone everywhere, in copy, comments,
// SQL and docs alike, and a single stray one in a card of user-facing text is
// exactly the kind of thing nobody notices in review. Ordinary hyphens are
// untouched, so kebab-case names, CSS classes and CLI flags are all safe.
//
// Run by `npm run lint` (and so by both preflight gates).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BANNED = /[—–]/;
const SKIP = /\.(png|jpg|jpeg|gif|webp|ico|svg|woff2?|pdf|lock)$/i;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !SKIP.test(f));

const offenders = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable or binary; nothing to check
  }
  if (!BANNED.test(text)) continue;
  text.split("\n").forEach((line, i) => {
    if (BANNED.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

if (offenders.length > 0) {
  console.error(
    `Em and en dashes are not used in this project. ${offenders.length} found:\n`,
  );
  for (const o of offenders.slice(0, 40)) console.error(`  ${o}`);
  if (offenders.length > 40) console.error(`  ...and ${offenders.length - 40} more`);
  console.error("\nUse a comma, a colon or a full stop instead.");
  process.exit(1);
}
