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

// Fat-source words: oils, butter/dairy fats, nuts/seeds, avocado, spreads.
const FAT_WORDS = new Set([
  "oil", "olive", "butter", "ghee", "lard", "dripping", "margarine", "avocado",
  "avocados", "mayonnaise", "mayo", "tahini", "cream", "coconut", "nut", "nuts",
  "almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pecan",
  "pistachio", "hazelnut", "seed", "seeds", "sesame", "sunflower", "pumpkin",
  "flaxseed", "chia", "peanut", "peanuts", "cheese", "mascarpone",
]);

// Drink words: anything you pour and sip. Milk counts as a drink here even
// though it carries protein — people shelve it as a drink, not a protein.
const DRINK_WORDS = new Set([
  "water", "juice", "cola", "coke", "soda", "lemonade", "squash", "cordial",
  "coffee", "tea", "milk", "smoothie", "shake", "beer", "wine", "cider",
  "kombucha", "drink", "drinks", "tonic", "sparkling", "espresso", "latte",
  "cappuccino", "cocoa",
]);

// Fruit words (singular + common plurals; `singular()` folds the rest).
const FRUIT_WORDS = new Set([
  "apple", "apples", "banana", "bananas", "orange", "oranges", "grape",
  "grapes", "berry", "berries", "strawberry", "strawberries", "blueberry",
  "blueberries", "raspberry", "raspberries", "blackberry", "blackberries",
  "mango", "mangoes", "pineapple", "pear", "pears", "peach", "peaches", "plum",
  "plums", "melon", "watermelon", "kiwi", "cherry", "cherries", "apricot",
  "apricots", "fig", "figs", "date", "dates", "raisin", "raisins", "lemon",
  "lemons", "lime", "limes", "clementine", "satsuma", "nectarine", "pomegranate",
]);

// Vegetable words. Potato/avocado are left out on purpose — they read as a carb
// and a fat respectively (they live in CARB_WORDS / FAT_WORDS).
const VEG_WORDS = new Set([
  "broccoli", "carrot", "carrots", "spinach", "kale", "lettuce", "cucumber",
  "tomato", "tomatoes", "pepper", "peppers", "onion", "onions", "garlic",
  "courgette", "courgettes", "zucchini", "aubergine", "eggplant", "cauliflower",
  "cabbage", "celery", "mushroom", "mushrooms", "pea", "peas", "sweetcorn",
  "beetroot", "leek", "leeks", "asparagus", "sprout", "sprouts", "salad",
  "greens", "rocket", "spring", "radish", "turnip", "parsnip", "squash",
  "pumpkin",
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

// True when the item name reads as a fat source.
export function isFat(name: string): boolean {
  return hasWordFrom(name, FAT_WORDS);
}

// True when the item name reads as a vegetable. Vegetables are meal FILLERS, not
// a macro source: the day planner gives each a fixed serving instead of growing
// it to chase a carb/protein target (nobody eats 400 g of onion to hit carbs).
// Potato/avocado are deliberately absent from VEG_WORDS — they read as a carb and
// a fat and stay meal bases.
export function isVegetable(name: string): boolean {
  return hasWordFrom(name, VEG_WORDS);
}

// The macro that dominates a food's calories — the reliable, data-driven
// classification the day planner uses (we already store every pantry item's
// per-100g macros, so no name-guessing needed). null for foods with negligible
// macros (water, black coffee, most vegetables), which aren't a meal base.
export interface FoodMacros {
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}
// A food is a protein source once protein carries this much of its calories.
// Not a majority: fat is 9 kcal/g against protein's 4, so on a "biggest share of
// calories" test almost every real protein loses to its own fat — salmon, eggs,
// beef mince and tofu all read as fat sources, which left the planner with no
// protein to build on and a day that quietly missed its protein target. Protein
// is the macro the whole plan is built to hit, so it anchors the meal whenever
// it is a serious part of the food.
const PROTEIN_SHARE = 0.25;

export function macroRole(m: FoodMacros): "protein" | "carb" | "fat" | null {
  const p = m.protein_100g * 4;
  const c = m.carbs_100g * 4;
  const f = m.fat_100g * 9;
  const total = p + c + f;
  // Below this the item carries too little of anything to anchor a meal.
  if (total < 40) return null;
  if (p / total >= PROTEIN_SHARE) return "protein";
  // Otherwise it's a carb or a fat, whichever carries more of the calories.
  return c >= f ? "carb" : "fat";
}

// The single role of a food, protein taking priority when a name reads as both
// (the protein is the "star" of the meal). null when it's neither (a vegetable,
// sauce, snack…).
export function foodRole(name: string): "protein" | "carb" | null {
  if (isProtein(name)) return "protein";
  if (isCarb(name)) return "carb";
  return null;
}

// The pantry categories the shelf is split into. The first six are what the
// auto-categoriser assigns; the rest exist for the user to move items into by
// hand (they're too ambiguous to guess). "Other" is the catch-all. Users can
// also type a brand-new category, so this list is a starting set, not a fence.
export const PANTRY_CATEGORIES = [
  "Protein",
  "Carbs",
  "Fat",
  "Vegetables",
  "Fruits",
  "Dairy",
  "Drinks",
  "Snacks",
  "Condiments",
  "Other",
] as const;

export type PantryCategory = (typeof PANTRY_CATEGORIES)[number];

// Pick the shelf a pantry item belongs on, from its name and per-100g macros.
// Deterministic, no AI: a drink/fruit/veg name wins first (a banana is a fruit,
// not "carbs"); otherwise the dominant macro decides Protein/Carbs/Fat, with a
// name read as the tie-breaker for foods too light on macros to classify
// (spices, black coffee). Falls back to "Other".
export function pantryCategory(name: string, m: FoodMacros): PantryCategory {
  if (hasWordFrom(name, DRINK_WORDS)) return "Drinks";
  if (hasWordFrom(name, FRUIT_WORDS)) return "Fruits";
  if (hasWordFrom(name, VEG_WORDS)) return "Vegetables";

  const role = macroRole(m);
  if (role === "protein") return "Protein";
  if (role === "carb") return "Carbs";
  if (role === "fat") return "Fat";

  // Negligible macros — lean on what the name reads as.
  if (isProtein(name)) return "Protein";
  if (isCarb(name)) return "Carbs";
  if (isFat(name)) return "Fat";
  return "Other";
}

// The pantry items that can serve as a base carbohydrate, in the given order.
export function pantryCarbs(names: string[]): string[] {
  return names.filter(isCarb);
}

// The pantry items that can serve as a protein, in the given order.
export function pantryProteins(names: string[]): string[] {
  return names.filter(isProtein);
}

// The pantry items that can serve as a fat source, in the given order.
export function pantryFats(names: string[]): string[] {
  return names.filter(isFat);
}
