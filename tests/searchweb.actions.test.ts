import { describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";
import type { OffCandidate } from "@/lib/types";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

// Stand in for the Open Food Facts search so the test never hits the network.
const searchProducts = vi.fn<(q: string, limit?: number) => Promise<OffCandidate[]>>();
vi.mock("@/lib/off", () => ({ searchProducts }));

const { searchWeb } = await import("@/app/(app)/plan/day/actions");

const candidate = (over: Partial<OffCandidate> = {}): OffCandidate => ({
  code: "111",
  name: "Blueberry Muffin",
  brand: "Costa",
  kcal_100g: 380,
  protein_100g: 5,
  carbs_100g: 55,
  fat_100g: 15,
  fiber_100g: 2,
  sugar_100g: 30,
  satfat_100g: 4,
  sodium_mg_100g: 200,
  pack_size_g: 90,
  unit_g: 90,
  unit_label: "muffin",
  ...over,
});

describe("searchWeb", () => {
  it("maps OFF candidates to off-source food choices", async () => {
    installFakeSupabase();
    searchProducts.mockResolvedValueOnce([candidate()]);

    const [c] = await searchWeb("blueberry muffin");

    expect(c.source).toBe("off");
    expect(c.off_barcode).toBe("111");
    expect(c.name).toBe("Blueberry Muffin");
    expect(c.brand).toBe("Costa");
    expect(c.kcal_100g).toBe(380);
    expect(c.unit_g).toBe(90);
    expect(c.unit_label).toBe("muffin");
    expect(c.unit_options).toBeNull();
  });

  it("drops candidates with no calories, an empty shell can't be portioned", async () => {
    installFakeSupabase();
    searchProducts.mockResolvedValueOnce([
      candidate({ name: "Real Food" }),
      candidate({ code: "222", name: "Empty Shell", kcal_100g: 0 }),
    ]);

    const results = await searchWeb("food");

    expect(results.map((r) => r.name)).toEqual(["Real Food"]);
  });

  it("returns nothing for a blank or one-character query without hitting OFF", async () => {
    installFakeSupabase();
    searchProducts.mockClear();

    expect(await searchWeb(" ")).toEqual([]);
    expect(await searchWeb("a")).toEqual([]);
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it("throws for a logged-out caller", async () => {
    installFakeSupabase({ user: null });
    await expect(searchWeb("muffin")).rejects.toThrow();
  });
});
