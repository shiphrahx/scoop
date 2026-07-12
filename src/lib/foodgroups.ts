// Categorize a pantry item by the role it plays in a meal: a base carbohydrate
// (rice, pasta, potatoes, quinoa…) or a protein (chicken, tofu, beans…). The
// "plan my day" wizard uses this to offer the user their OWN pantry items as the
// carb / protein to build a meal around. Keyword match on the item's words,
// plural-folded — free and deterministic, no AI call (mirrors the off.ts sets).

// Base-carbohydrate words. Both singular and plural forms are listed so a raw
// token match works; `singular()` covers any plural we forgot.
const CARB_WORDS = new Set([
  "rice", "pasta", "spaghetti", "penne", "macaroni", "fusilli", "tagliatelle",
  "linguine", "orzo", "vermicelli", "lasagne", "lasagna", "noodle", "noodles",
  "ramen", "udon", "potato", "potatoes", "quinoa", "couscous", "bulgur",
  "barley", "freekeh", "farro", "oat", "oats", "oatmeal", "porridge", "bread",
  "roll", "rolls", "bagel", "bagels", "tortilla", "tortillas", "wrap", "wraps",
  "pitta", "pita", "naan", "chapati", "cereal", "granola", "muesli", "gnocchi",
  "polenta", "cornmeal", "yam", "yams", "plantain", "risotto", "cracker",
  "crackers", "flatbread", "bun", "buns", "baguette", "brioche", "cornflakes",
  "weetabix", "shreddies", "crumpet", "crumpets",
]);

// Protein-source words. Covers meat, fish, eggs, pulses, tofu/meat-substitutes,
// and higher-protein dairy (Greek yogurt, paneer, halloumi, cottage cheese).
const PROTEIN_WORDS = new Set([
  "chicken", "beef", "pork", "lamb", "turkey", "duck", "veal", "mince", "steak",
  "bacon", "ham", "gammon", "sausage", "sausages", "salami", "chorizo",
  "pepperoni", "prosciutto", "egg", "eggs", "tofu", "tempeh", "seitan", "quorn",
  "edamame", "bean", "beans", "lentil", "lentils", "chickpea", "chickpeas",
  "hummus", "falafel", "salmon", "tuna", "cod", "haddock", "mackerel",
  "sardine", "sardines", "prawn", "prawns", "shrimp", "crab", "yogurt",
  "yoghurt", "skyr", "paneer", "halloumi", "feta", "cottage", "peanut",
  "peanuts", "protein",
]);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Rough singular so an unlisted plural still matches ("tomatoes" isn't a base
// but "gnocchis" → "gnocchi", "wraps" → "wrap").
function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function hasWordFrom(name: string, set: Set<string>): boolean {
  return tokenize(name).some((w) => set.has(w) || set.has(singular(w)));
}

// True when the item name reads as a base carbohydrate.
export function isCarb(name: string): boolean {
  return hasWordFrom(name, CARB_WORDS);
}

// True when the item name reads as a protein source.
export function isProtein(name: string): boolean {
  return hasWordFrom(name, PROTEIN_WORDS);
}

// The single role of a food, protein taking priority when a name reads as both
// (the protein is the "star" of the meal). null when it's neither (a vegetable,
// sauce, snack…).
export function foodRole(name: string): "protein" | "carb" | null {
  if (isProtein(name)) return "protein";
  if (isCarb(name)) return "carb";
  return null;
}

// The pantry items that can serve as a base carbohydrate, in the given order.
export function pantryCarbs(names: string[]): string[] {
  return names.filter(isCarb);
}

// The pantry items that can serve as a protein, in the given order.
export function pantryProteins(names: string[]): string[] {
  return names.filter(isProtein);
}
