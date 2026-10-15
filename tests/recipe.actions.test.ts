import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

// vi.mock is hoisted above the imports, so the factory reaches the fake lazily.
vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const parseRecipeFromUrl = vi.fn();
vi.mock("@/lib/ai", () => ({
  parseRecipeFromUrl: (url: string) => parseRecipeFromUrl(url),
  parseRecipeFromImage: vi.fn(),
}));

const { importRecipeUrl } = await import("@/app/(app)/plan/recipe/actions");

const omelette = {
  name: "Basic omelette",
  servings: 1,
  ingredients: [{ name: "3 eggs", quantity: "" }],
  kcal: 277,
  protein_g: 20,
  carbs_g: 0,
  fat_g: 22,
};

describe("importRecipeUrl", () => {
  it("hands the recipe back when the page reads", async () => {
    installFakeSupabase({ db: {} });
    parseRecipeFromUrl.mockResolvedValueOnce(omelette);

    const r = await importRecipeUrl("https://example.com/omelette");

    expect(r).toEqual({ ok: true, recipe: omelette });
  });

  // A production build masks a thrown server action's message, which is how a
  // refused Waitrose fetch reached the screen as "An error occurred in the
  // Server Components render". The reason has to come back as a value.
  it("returns the reason instead of throwing when the import fails", async () => {
    installFakeSupabase({ db: {} });
    vi.spyOn(console, "error").mockImplementation(() => {});
    parseRecipeFromUrl.mockRejectedValueOnce(
      new Error("Couldn't fetch that page. Check the link."),
    );

    const r = await importRecipeUrl("https://example.com/omelette");

    expect(r).toEqual({ ok: false, message: "Couldn't fetch that page. Check the link." });
  });
});
