// Turn USDA's FNDDS release into a migration that seeds the shared food
// reference.
//
// Why this exists: Open Food Facts is a database of *packaged products*. It
// answers "chocolate cake" with a Waitrose cake at 393 kcal/100g and no serving
// size at all — every hit we probed came back `serving=none`. Scoop's whole
// promise is telling you the portion, so a source with per-portion gram weights
// is not a nice-to-have. FNDDS has them, because it exists to convert what
// survey respondents SAY they ate ("a slice of cake") into grams.
//
// Public domain, no API key, no runtime dependency: this runs once, offline,
// and its output is a plain SQL migration reviewed like any other.
//
// Usage:
//   1. Download the Survey (FNDDS) CSV bundle from
//      https://fdc.nal.usda.gov/download-datasets  (FoodData_Central_survey_food_csv_*.zip)
//   2. Unzip it anywhere.
//   3. node scripts/import-fndds.mjs <path-to-unzipped-folder> [out.sql]
//
// Re-running against a newer release regenerates the file; the migration itself
// is idempotent, so applying it twice is a no-op.

import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";

const dir = process.argv[2];
const out = process.argv[3] ?? "migrations/0033_fndds_seed.sql";
if (!dir) {
  console.error("usage: node scripts/import-fndds.mjs <unzipped-fndds-dir> [out.sql]");
  process.exit(1);
}

// --- CSV --------------------------------------------------------------------
// FNDDS ships RFC-4180 CSV: quoted fields, doubled quotes inside them. Small
// enough to hand-parse, which keeps this script dependency-free.
function splitCsvLine(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out;
}

// Stream one CSV, yielding each row as an object keyed by the header. Streamed
// because food_nutrient.csv is ~19 MB and there is no reason to hold it.
async function* readCsv(name) {
  const rl = createInterface({
    input: createReadStream(join(dir, name), "utf8"),
    crlfDelay: Infinity,
  });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = splitCsvLine(line);
    if (!header) {
      header = cells.map((h) => h.replace(/^﻿/, "").trim());
      continue;
    }
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    yield row;
  }
}

// --- Nutrients --------------------------------------------------------------
// The `nutrient_id` column in this bundle carries USDA's *nutrient number*, not
// the FoodData Central nutrient id — 208 rather than 1008. Reading it as an id
// silently matches nothing, so these are the numbers.
const NUTRIENTS = {
  208: "kcal",
  203: "protein",
  205: "carbs",
  204: "fat",
  291: "fiber",
  269: "sugar",
  606: "satfat",
  307: "sodium", // mg, as we store it
};

// --- Portions ---------------------------------------------------------------
// Measures that tell you nothing when you are looking at a plate. A cup of
// diced chicken or "1 surface inch" of cake is not a portion anyone taps.
const VOLUME_OR_GEOMETRY =
  /\b(cups?|fl oz|oz|ounces?|tbsp|tablespoons?|teaspoons?|tsp|cubic inch|surface inch|inch|grams?|ml|quarts?|pints?|gallons?|lbs?|dash|drop|guideline amount)\b/i;

// Wordings that mean "smaller than usual" / "bigger than usual". Only used to
// decide whether a weight is a candidate at all — the actual small/medium/large
// labelling is done by weight below, because FNDDS wordings are compound
// ("1 regular or small piece/slice, 2+ layer cake") and ranking them by wording
// produced a chocolate cake whose "small" outweighed its "large".
const COUNTABLE =
  /\b(small|thin|mini|miniature|bite size|slider|large|thick|jumbo|medium|regular|piece|slice|whole|each|item|serving|sandwich|egg|link|patty|cupcake|bar|roll|taco|wrap|bag|container|package|cookie|muffin|stick|wedge|ball|cake|scoop|fillet|breast|thigh|drumstick|chop|steak|burger|square|pancake|waffle|donut|doughnut|biscuit|bun|bagel|tortilla|pie|pizza|samosa|dumpling|spring roll)\b/i;

// FNDDS records the typical portion under this label — what a respondent gets
// when they said "a cake" without saying how much. It's the best anchor we have
// for "medium", so it wins that slot outright.
const TYPICAL = "quantity not specified";

// Sizes closer together than this read as duplicates to a user ("small 28 g,
// medium 28 g"), so the tighter one is dropped.
const DISTINCT_RATIO = 1.15;

// Turn one food's candidate gram weights into at most three named sizes.
// Ranked by weight, never by wording, so small < medium < large always holds.
function toSizes(typicalG, others) {
  const distinct = [...new Set(others.map((g) => Math.round(g)))].sort((a, b) => a - b);

  // No typical portion: rank whatever we have.
  if (!typicalG) {
    if (distinct.length === 0) return [];
    if (distinct.length === 1) return [{ label: "medium", grams: distinct[0] }];
    if (distinct.length === 2) {
      return [
        { label: "medium", grams: distinct[0] },
        { label: "large", grams: distinct[1] },
      ];
    }
    return [
      { label: "small", grams: distinct[0] },
      { label: "medium", grams: distinct[Math.floor((distinct.length - 1) / 2)] },
      { label: "large", grams: distinct[distinct.length - 1] },
    ];
  }

  const medium = Math.round(typicalG);
  const below = distinct.filter((g) => g * DISTINCT_RATIO < medium);
  const above = distinct.filter((g) => g > medium * DISTINCT_RATIO);
  const sizes = [{ label: "medium", grams: medium }];
  if (below.length) sizes.unshift({ label: "small", grams: below[0] });
  if (above.length) sizes.push({ label: "large", grams: above[above.length - 1] });
  return sizes;
}

// --- SQL --------------------------------------------------------------------
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlNum = (n) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "0");

async function main() {
  // 1. The foods themselves.
  const names = new Map(); // fdc_id -> description
  for await (const r of readCsv("food.csv")) {
    if (r.data_type !== "survey_fndds_food") continue;
    const d = (r.description ?? "").trim();
    if (d) names.set(r.fdc_id, d);
  }

  // 2. Their macros, per 100 g (FNDDS amounts are already per 100 g).
  const macros = new Map();
  for await (const r of readCsv("food_nutrient.csv")) {
    const key = NUTRIENTS[Number(r.nutrient_id)];
    if (!key || !names.has(r.fdc_id)) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    if (!macros.has(r.fdc_id)) macros.set(r.fdc_id, {});
    macros.get(r.fdc_id)[key] = amount;
  }

  // 3. Their portions.
  const typical = new Map();
  const others = new Map();
  for await (const r of readCsv("food_portion.csv")) {
    if (!names.has(r.fdc_id)) continue;
    const grams = Number(r.gram_weight);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    const label = (r.portion_description ?? "").trim();
    if (label.toLowerCase() === TYPICAL) {
      typical.set(r.fdc_id, grams);
      continue;
    }
    if (VOLUME_OR_GEOMETRY.test(label) || !COUNTABLE.test(label)) continue;
    if (!others.has(r.fdc_id)) others.set(r.fdc_id, []);
    others.get(r.fdc_id).push(grams);
  }

  // 4. Assemble, dropping anything with no energy (nothing to portion) and
  //    anything physically impossible (pure fat is 9 kcal/g, so 900 is the
  //    ceiling for 100 g of anything edible).
  const foods = [];
  for (const [id, name] of names) {
    const m = macros.get(id);
    if (!m || !(m.kcal > 0) || m.kcal > 900) continue;
    foods.push({
      id: Number(id),
      name,
      m,
      sizes: toSizes(typical.get(id), others.get(id) ?? []),
    });
  }
  foods.sort((a, b) => a.id - b.id);

  const sizeCount = foods.reduce((n, f) => n + f.sizes.length, 0);

  // 5. Emit.
  const lines = [];
  lines.push(
    `-- Scoop: the shared food reference, seeded from USDA FNDDS ${new Date().toISOString().slice(0, 10)}.`,
    "--",
    "-- GENERATED FILE — do not hand-edit. Regenerate with:",
    "--   node scripts/import-fndds.mjs <unzipped FoodData_Central_survey_food_csv_* folder>",
    "--",
    "-- Why: Open Food Facts is a database of packaged products and carries no",
    "-- serving size for the things people actually ask about — a slice of cake, a",
    "-- cookie, a portion of chips. FNDDS is the food list the US codes its national",
    "-- diet survey against, so every food comes with the gram weight of a real",
    "-- portion. That gram weight is the whole point: it is what lets one tap add",
    "-- '1 medium slice, 95 g' instead of dropping the user on an empty grams field.",
    "--",
    "-- Caveat worth knowing when reading these rows: FNDDS is American. Its names",
    "-- are US ones ('Cookie, chocolate chip'), and British-only foods (flapjack,",
    "-- digestive) are simply absent — those are seeded by hand in 0032, which runs",
    "-- first and therefore wins any name collision. UK wording is bridged by the",
    "-- alias table in 0034.",
    "--",
    `-- ${foods.length} foods, ${sizeCount} portion sizes. created_by is null on every`,
    "-- row, which marks them read-only under RLS. Run after 0032.",
    "",
    "-- The FoodData Central id, so a later release can be matched back to the row",
    "-- it updates rather than duplicating it under a slightly reworded name.",
    "alter table public.fresh_foods",
    "  add column if not exists fdc_id integer;",
    "",
    "create unique index if not exists fresh_foods_fdc_id",
    "  on public.fresh_foods (fdc_id) where fdc_id is not null;",
    "",
  );

  // Foods, in batches — one giant VALUES list is slower to plan and unreadable
  // in a diff.
  const BATCH = 200;
  for (let i = 0; i < foods.length; i += BATCH) {
    const chunk = foods.slice(i, i + BATCH);
    lines.push(
      "insert into public.fresh_foods",
      "  (fdc_id, name, kcal_100g, protein_100g, carbs_100g, fat_100g,",
      "   fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, created_by)",
      "values",
    );
    lines.push(
      chunk
        .map(
          (f) =>
            `  (${f.id}, ${sqlStr(f.name)}, ${sqlNum(f.m.kcal)}, ${sqlNum(f.m.protein)},` +
            ` ${sqlNum(f.m.carbs)}, ${sqlNum(f.m.fat)}, ${sqlNum(f.m.fiber)},` +
            ` ${sqlNum(f.m.sugar)}, ${sqlNum(f.m.satfat)}, ${sqlNum(f.m.sodium)}, null)`,
        )
        .join(",\n"),
    );
    // A name we already seeded by hand (0032) or from an earlier release keeps
    // what it has: the hand rows are the British ones, and they are better.
    lines.push("on conflict (lower(name)) do nothing;", "");
  }

  // Sizes, matched back by fdc_id so a skipped name collision doesn't attach
  // American portions to a British food.
  const sizeRows = foods.flatMap((f) =>
    f.sizes.map((s) => `  (${f.id}, ${sqlStr(s.label)}, ${sqlNum(s.grams)})`),
  );
  for (let i = 0; i < sizeRows.length; i += BATCH) {
    lines.push(
      "insert into public.fresh_food_sizes (food_id, label, grams, created_by)",
      "select f.id, s.label, s.grams, null",
      "from (values",
      sizeRows.slice(i, i + BATCH).join(",\n"),
      ") as s(fdc_id, label, grams)",
      "join public.fresh_foods f on f.fdc_id = s.fdc_id",
      "where not exists (",
      "  select 1 from public.fresh_food_sizes x",
      "  where x.food_id = f.id and lower(x.label) = lower(s.label)",
      ");",
      "",
    );
  }

  await writeFile(out, lines.join("\n"), "utf8");
  console.log(`${out}: ${foods.length} foods, ${sizeCount} sizes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
