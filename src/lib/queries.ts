import { createClient } from "@/lib/supabase/server";
import { weekStart } from "@/lib/coach";
import type { DailyTargets, Macros, Profile } from "@/lib/types";

// Server-side reads. Each returns the current user's data (RLS enforces scope).

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

export async function getCurrentTargets(): Promise<DailyTargets | null> {
  const supabase = await createClient();
  // Prefer this week's target; fall back to the most recent one.
  const { data } = await supabase
    .from("daily_targets")
    .select("week_start, kcal, protein_g, carbs_g, fat_g")
    .lte("week_start", weekStart())
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as DailyTargets) ?? null;
}

export async function getTodayConsumed(): Promise<Macros> {
  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("food_logs")
    .select("kcal, protein_g, carbs_g, fat_g")
    .gte("logged_at", start.toISOString());

  const rows = (data as Macros[]) ?? [];
  return rows.reduce<Macros>(
    (sum, r) => ({
      kcal: sum.kcal + Number(r.kcal),
      protein_g: sum.protein_g + Number(r.protein_g),
      carbs_g: sum.carbs_g + Number(r.carbs_g),
      fat_g: sum.fat_g + Number(r.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

// True when the user has saved an Anthropic key (the key itself never leaves
// the server — we only report whether one exists).
export async function hasApiKey(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("users")
    .select("anthropic_api_key")
    .eq("id", user.id)
    .maybeSingle();

  return Boolean((data as { anthropic_api_key: string | null } | null)?.anthropic_api_key);
}

export async function getLatestWeight(): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weights")
    .select("weight_kg")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? Number((data as { weight_kg: number }).weight_kg) : null;
}
