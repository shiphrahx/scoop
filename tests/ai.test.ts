import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

// The AI features, with the model's replies canned. What's under test is not the
// model — it's what we do with what it says. Everything it returns ends up as a
// pantry item, a meal fixed into the day's budget, or a food log, and from there
// in the trailing averages the coach adjusts the user's calories from.

const parse = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {
    messages = { parse };
  },
}));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: (schema: unknown) => schema,
}));
vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});

const {
  NoApiKeyError,
  estimateMeals,
  parseGroceryImage,
  planDay,
  suggestMeals,
} = await import("@/lib/ai");

// The model's reply for the next call.
const modelReturns = (parsed_output: unknown) =>
  parse.mockResolvedValueOnce({ parsed_output });

// A signed-in user with a key saved. The key is stored unencrypted here, which
// decryptSecret passes through as a legacy row.
function signedInWithKey() {
  return installFakeSupabase({
    db: { users: [{ id: "user-1", anthropic_api_key: "sk-ant-test" }] },
  });
}

const meal = (over: Record<string, unknown> = {}) => ({
  slot: "Dinner",
  name: "Chicken and rice",
  kcal: 620,
  protein_g: 55,
  carbs_g: 65,
  fat_g: 12,
  ...over,
});

beforeEach(() => {
  parse.mockReset();
  signedInWithKey();
});

describe("getting a client", () => {
  it("refuses when the user has saved no API key", async () => {
    installFakeSupabase({ db: { users: [{ id: "user-1", anthropic_api_key: null }] } });
    await expect(estimateMeals([{ slot: "Dinner", text: "pizza" }], "regular")).rejects.toThrow(
      NoApiKeyError,
    );
  });
});

describe("estimateMeals", () => {
  it("returns the model's estimate for a meal the user described", async () => {
    modelReturns({ meals: [meal()] });

    const out = await estimateMeals([{ slot: "Dinner", text: "chicken and rice" }], "regular");

    expect(out).toHaveLength(1);
    expect(out[0].kcal).toBe(620);
    expect(out[0].slot).toBe("Dinner");
  });

  it("does not call the model for an empty description", async () => {
    expect(await estimateMeals([{ slot: "Dinner", text: "  " }], "regular")).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it("drops an estimate whose macros don't add up, keeping the good one", async () => {
    // 0 kcal alongside 60 g of protein is not a meal. Fixed into the day, it
    // would hand the user 240 kcal of budget that doesn't exist and every other
    // meal the planner builds would be sized around the gap.
    modelReturns({
      meals: [
        meal(),
        meal({ slot: "Lunch", name: "Ghost sandwich", kcal: 0, protein_g: 60, carbs_g: 40, fat_g: 10 }),
      ],
    });

    const out = await estimateMeals(
      [
        { slot: "Dinner", text: "chicken and rice" },
        { slot: "Lunch", text: "sandwich" },
      ],
      "regular",
    );

    expect(out).toHaveLength(1);
    expect(out[0].slot).toBe("Dinner");
  });

  it("reports a failed read rather than pretending the day is empty", async () => {
    // Everything came back nonsense. Returning [] would look like it worked and
    // the user would be planned around meals that silently vanished.
    modelReturns({ meals: [meal({ kcal: -400 })] });

    await expect(
      estimateMeals([{ slot: "Dinner", text: "chicken and rice" }], "regular"),
    ).rejects.toThrow(/sensible estimate/i);
  });

  it("survives the model returning nothing at all", async () => {
    modelReturns(null);
    expect(await estimateMeals([{ slot: "Dinner", text: "x" }], "regular")).toEqual([]);
  });

  it("lets a network failure surface rather than logging a guess", async () => {
    parse.mockRejectedValueOnce(new Error("overloaded_error"));
    await expect(
      estimateMeals([{ slot: "Dinner", text: "x" }], "regular"),
    ).rejects.toThrow(/overloaded/);
  });
});

describe("parseGroceryImage", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    name: "Basmati Rice",
    kcal_100g: 130,
    protein_100g: 2.7,
    carbs_100g: 28,
    fat_100g: 0.3,
    ...over,
  });

  it("reads the shopping list", async () => {
    modelReturns({ items: [item()] });
    const out = await parseGroceryImage("base64data", "image/png");
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Basmati Rice");
  });

  it("drops a food whose numbers can't be food", async () => {
    // A price column read as calories: 100 g of rice at 899 kcal with no macros
    // to account for it. In the pantry it would misprice every meal built on it.
    modelReturns({
      items: [
        item(),
        item({ name: "Rice (misread)", kcal_100g: 899, protein_100g: 2, carbs_100g: 3, fat_100g: 0 }),
        item({ name: "Impossible", protein_100g: 60, carbs_100g: 60, fat_100g: 5 }),
      ],
    });

    const out = await parseGroceryImage("base64data", "image/png");
    expect(out.map((i) => i.name)).toEqual(["Basmati Rice"]);
  });

  it("says the screenshot was unreadable when nothing survives", async () => {
    modelReturns({ items: [item({ kcal_100g: 5000 })] });
    await expect(parseGroceryImage("base64data", "image/png")).rejects.toThrow(
      /clearer picture/i,
    );
  });

  it("returns an empty list when the model found no food", async () => {
    modelReturns({ items: [] });
    expect(await parseGroceryImage("base64data", "image/png")).toEqual([]);
  });
});

describe("suggestMeals", () => {
  const input = {
    diet: "regular" as const,
    allergies: [],
    dislikes: [],
    pantry: ["Chicken Breast", "Basmati Rice"],
    remaining: { kcal: 620, protein_g: 55, carbs_g: 65, fat_g: 12 },
  };

  const dish = (over: Record<string, unknown> = {}) => ({
    name: "Chicken and rice",
    uses: ["Chicken Breast", "Basmati Rice"],
    portions: [{ name: "Chicken Breast", grams: 180 }],
    swaps: [],
    why: "Fits your macros.",
    kcal: 620,
    protein_g: 55,
    carbs_g: 65,
    fat_g: 12,
    ...over,
  });

  it("passes a sound suggestion through", async () => {
    modelReturns({ meals: [dish()] });
    const out = await suggestMeals(input);
    expect(out).toHaveLength(1);
  });

  it("drops a suggestion whose macros don't add up", async () => {
    modelReturns({ meals: [dish({ kcal: 3000, protein_g: 5, carbs_g: 5, fat_g: 2 })] });
    expect(await suggestMeals(input)).toEqual([]);
  });

  it("still drops a dish that breaks the diet", async () => {
    modelReturns({
      meals: [dish({ name: "Chicken curry", uses: ["Chicken Breast"] })],
    });
    expect(await suggestMeals({ ...input, diet: "vegan" })).toEqual([]);
  });
});

describe("planDay", () => {
  const input = {
    diet: "regular" as const,
    allergies: [],
    dislikes: [],
    pantry: ["Chicken Breast", "Basmati Rice"],
    budget: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 },
    fixed: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    emptySlots: ["Dinner"],
  };

  const slot = (over: Record<string, unknown> = {}) => ({
    slot: "Dinner",
    origin: "ai" as const,
    name: "Chicken and rice",
    portions: [{ name: "Chicken Breast", grams: 180 }],
    swaps: [],
    why: "Fills what's left of today.",
    kcal: 620,
    protein_g: 55,
    carbs_g: 65,
    fat_g: 12,
    ...over,
  });

  it("plans the empty slot", async () => {
    modelReturns({ meals: [slot()] });
    const out = await planDay(input);
    expect(out).toHaveLength(1);
    expect(out[0].slot).toBe("Dinner");
  });

  it("drops a planned dish whose macros don't add up", async () => {
    // This one is written straight into the day's plan and logged from there.
    modelReturns({ meals: [slot({ kcal: 0, protein_g: 50, carbs_g: 50, fat_g: 20 })] });
    expect(await planDay(input)).toEqual([]);
  });
});
