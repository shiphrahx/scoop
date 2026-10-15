// A recipe page lists its ingredients as lines of text ("3 eggs, beaten", "1 tsp
// sunflower oil", "275 g pack rice noodles"). To drop a recipe into a meal as
// foods the user can adjust, each line has to become a food to search for and
// an amount. This pulls the two apart. Pure, so the odd lines recipe sites
// write can be pinned down in tests.

export interface IngredientLine {
  // What to search the food reference for, amount and prep words stripped.
  term: string;
  // An explicit weight, when the line gives one ("275 g", "1 tsp" read as 5 g).
  grams: number | null;
  // A bare count with no weight ("3 eggs"), to multiply by the food's own size.
  count: number | null;
  // Seasoning and water: worth nothing to the day, so not worth a food.
  skip: boolean;
}

// Weights and volumes, in grams. Volumes are read as water, which is close
// enough for the milk, stock and oil a recipe measures this way.
const WEIGHT_G: Record<string, number> = {
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  g: 1, gram: 1, grams: 1, gr: 1,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1,
};

// Spoons and cups by their usual UK measure.
const SPOON_G: Record<string, number> = {
  tsp: 5, teaspoon: 5, teaspoons: 5,
  dsp: 10, dessertspoon: 10, dessertspoons: 10,
  tbsp: 15, tbs: 15, tbl: 15, tablespoon: 15, tablespoons: 15,
  cup: 240, cups: 240,
};

// Containers a weight is quoted on ("200 g jar"), never part of the food.
const CONTAINERS = [
  "pack", "packs", "packet", "packets", "jar", "jars", "tin", "tins", "can",
  "cans", "bag", "bags", "pot", "pots", "tub", "tubs", "bottle", "bottles",
  "carton", "cartons", "punnet", "punnets", "bunch", "bunches", "box", "boxes",
];

// How a food is prepared, which doesn't change what it is.
const PREP = [
  "beaten", "chopped", "finely", "roughly", "thinly", "sliced", "diced",
  "grated", "crushed", "minced", "peeled", "deseeded", "halved", "quartered",
  "trimmed", "shredded", "torn", "melted", "softened", "drained", "rinsed",
  "washed", "cubed", "large", "medium", "small", "fresh", "freshly", "whole",
  "about", "approx", "approximately", "plus", "extra", "heaped", "level",
  "of", "x",
];

const UNIT = Object.keys(WEIGHT_G).join("|");
const SPOON = Object.keys(SPOON_G).join("|");

const FRACTIONS: Record<string, string> = {
  "½": ".5", "¼": ".25", "¾": ".75", "⅓": ".33", "⅔": ".67", "⅛": ".125",
};

// "1½" → "1.5", "1/2" → "0.5", "1 1/2" → "1.5".
function normaliseNumbers(s: string): string {
  let out = s.replace(/(\d*)\s*([½¼¾⅓⅔⅛])/g, (_, whole: string, f: string) =>
    String(Number(whole || "0") + Number(FRACTIONS[f])),
  );
  out = out.replace(/(\d+)\s+(\d+)\/(\d+)/g, (_, w, n, d) =>
    String(Number(w) + Number(n) / Number(d)),
  );
  out = out.replace(/(\d+)\/(\d+)/g, (_, n, d) => String(Number(n) / Number(d)));
  return out;
}

function isSeasoning(term: string): boolean {
  const t = term.toLowerCase();
  if (/\b(to taste|to season|for seasoning|pinch|dash|splash of water)\b/.test(t)) {
    return true;
  }
  const bare = t.replace(/\b(and|or|black|white|sea|ground|cold|hot|boiling|freshly)\b/g, "");
  return /^[\s,]*((salt|pepper|water|ice)[\s,]*)+$/.test(bare);
}

// Strip a line down to the food: anything after the first comma (the prep
// note), a parenthetical, container words, prep words, stray punctuation.
function cleanTerm(s: string): string {
  const words = s
    .split(",")[0]
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .split(/[^a-z'’&-]+/)
    .filter((w) => w && !CONTAINERS.includes(w) && !PREP.includes(w));
  return words.join(" ").trim();
}

export function parseIngredientLine(raw: string): IngredientLine {
  const s = normaliseNumbers(raw.replace(/\s+/g, " ").trim());

  // "2 x 400 g tins chopped tomatoes": a count of a weighed container.
  const multi = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b(.*)$`, "i"));
  if (multi) {
    const grams = Number(multi[1]) * Number(multi[2]) * WEIGHT_G[multi[3].toLowerCase()];
    const term = cleanTerm(multi[4]);
    return { term, grams: Math.round(grams), count: null, skip: isSeasoning(term) };
  }

  // A weight anywhere in the line, including a parenthetical ("1 tin (400g)").
  const weight = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b`, "i"));
  // A spoon or cup measure.
  const spoon = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)?\\s*\\b(${SPOON})\\b\\.?`, "i"));

  if (weight) {
    const grams = Number(weight[1]) * WEIGHT_G[weight[2].toLowerCase()];
    const rest = s.replace(weight[0], " ").replace(/^\s*\d+(?:\.\d+)?\s*/, " ");
    const term = cleanTerm(rest);
    return { term, grams: Math.round(grams), count: null, skip: isSeasoning(term) };
  }

  if (spoon) {
    const n = spoon[1] ? Number(spoon[1]) : 1;
    const grams = n * SPOON_G[spoon[2].toLowerCase()];
    const term = cleanTerm(s.replace(spoon[0], " "));
    return { term, grams: Math.round(grams), count: null, skip: isSeasoning(term) };
  }

  // A leading count with no unit: "3 eggs", "2 garlic cloves".
  const counted = s.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (counted) {
    const term = cleanTerm(counted[2]);
    return { term, grams: null, count: Number(counted[1]), skip: isSeasoning(term) };
  }

  const term = cleanTerm(s);
  return { term, grams: null, count: null, skip: isSeasoning(s) };
}
