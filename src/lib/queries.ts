import { createClient } from "@/lib/supabase/server";
import { average, weekStart, weeklyReview, type WeeklyReview } from "@/lib/coach";
import type {
  Activity,
  DailyTargets,
  Macros,
  PlannedMeal,
  Profile,
} from "@/lib/types";

// Today's date in the user's local timezone as YYYY-MM-DD. Used for the
// planned_meals.date column so a plan lines up with the calendar day, matching
// how getTodayConsumed sums food from local midnight.
export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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
    .select("week_start, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg")
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
    .select("kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg")
    .gte("logged_at", start.toISOString());

  const rows = (data as Macros[]) ?? [];
  return rows.reduce<Required<Macros>>(
    (sum, r) => ({
      kcal: sum.kcal + Number(r.kcal),
      protein_g: sum.protein_g + Number(r.protein_g),
      carbs_g: sum.carbs_g + Number(r.carbs_g),
      fat_g: sum.fat_g + Number(r.fat_g),
      fiber_g: sum.fiber_g + Number(r.fiber_g ?? 0),
      sugar_g: sum.sugar_g + Number(r.sugar_g ?? 0),
      satfat_g: sum.satfat_g + Number(r.satfat_g ?? 0),
      sodium_mg: sum.sodium_mg + Number(r.sodium_mg ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, satfat_g: 0, sodium_mg: 0 },
  );
}

// Today's saved day plan (all slots), ordered as the user arranged them.
export async function getTodayPlan(): Promise<PlannedMeal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planned_meals")
    .select(
      "id, date, slot, position, origin, name, items, portions, swaps, why, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg, logged_food_id",
    )
    .eq("date", localToday())
    .order("position", { ascending: true });

  return ((data as PlannedMeal[]) ?? []).map((m) => ({
    ...m,
    kcal: Number(m.kcal),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    fiber_g: Number(m.fiber_g ?? 0),
    sugar_g: Number(m.sugar_g ?? 0),
    satfat_g: Number(m.satfat_g ?? 0),
    sodium_mg: Number(m.sodium_mg ?? 0),
  }));
}

// True once the user has logged any food today — used to decide whether to
// nudge them to plan the day.
export async function hasTrackedToday(): Promise<boolean> {
  const supabase = await createClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("food_logs")
    .select("id", { count: "exact", head: true })
    .gte("logged_at", start.toISOString());
  return (count ?? 0) > 0;
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

// Everything the Coach page needs: the weekly review plus the raw numbers and
// connection state behind it. Also used by the "apply" action so the target it
// writes is computed from the same rules the page showed.
export interface CoachData {
  review: WeeklyReview;
  current: Macros | null;
  thisWeekAvgKg: number | null;
  lastWeekAvgKg: number | null;
  waistDeltaCm: number | null;
  activity: Activity[];
  fitbitConnected: boolean;
  appleIngestToken: string | null;
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function getCoachData(): Promise<CoachData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const cut7 = isoDay(new Date(now.getTime() - 6 * DAY_MS)); // last 7 days incl today
  const cut14 = isoDay(new Date(now.getTime() - 13 * DAY_MS));

  const [profile, current, weightsRes, measRes, activityRes, fitbitRes, tokenRes] =
    await Promise.all([
      getProfile(),
      getCurrentTargets(),
      supabase
        .from("weights")
        .select("date, weight_kg")
        .gte("date", cut14)
        .order("date", { ascending: false }),
      supabase
        .from("measurements")
        .select("date, waist_cm")
        .not("waist_cm", "is", null)
        .order("date", { ascending: false })
        .limit(2),
      supabase
        .from("activity")
        .select("date, steps, workout_kcal, sleep_hours, source")
        .order("date", { ascending: false })
        .limit(7),
      user
        ? supabase.from("fitbit_tokens").select("user_id").eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from("users").select("apple_ingest_token").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const weights = (weightsRes.data as { date: string; weight_kg: number }[]) ?? [];
  const thisWeek = weights.filter((w) => w.date >= cut7).map((w) => Number(w.weight_kg));
  const lastWeek = weights
    .filter((w) => w.date < cut7)
    .map((w) => Number(w.weight_kg));

  const thisWeekAvgKg = average(thisWeek);
  const lastWeekAvgKg = average(lastWeek);

  const meas = (measRes.data as { waist_cm: number }[]) ?? [];
  const waistDeltaCm =
    meas.length >= 2 ? Number(meas[0].waist_cm) - Number(meas[1].waist_cm) : null;

  const sex = profile?.sex ?? "female";
  const review = current
    ? weeklyReview({
        sex,
        diet: profile?.diet_type ?? "regular",
        // When we have no weigh-in this week, drop last week too so the review
        // just says "keep logging" rather than comparing against stale data.
        thisWeekAvgKg: thisWeekAvgKg ?? lastWeekAvgKg ?? 0,
        lastWeekAvgKg: thisWeekAvgKg == null ? null : lastWeekAvgKg,
        waistDeltaCm,
        current,
      })
    : {
        macros: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        changed: false,
        changeKg: null,
        changePct: null,
        headline: "Finish onboarding",
        detail: "Set up your profile so I can work out your targets.",
      };

  return {
    review,
    current,
    thisWeekAvgKg,
    lastWeekAvgKg,
    waistDeltaCm,
    activity: (activityRes.data as Activity[]) ?? [],
    fitbitConnected: Boolean((fitbitRes.data as { user_id: string } | null)?.user_id),
    appleIngestToken:
      (tokenRes.data as { apple_ingest_token: string | null } | null)
        ?.apple_ingest_token ?? null,
  };
}

// Recent weigh-ins, oldest→newest, for the dashboard trend chart.
export async function getWeightHistory(
  days = 30,
): Promise<{ date: string; weight_kg: number }[]> {
  const supabase = await createClient();
  const cut = isoDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const { data } = await supabase
    .from("weights")
    .select("date, weight_kg")
    .gte("date", cut)
    .order("date", { ascending: true });
  return ((data as { date: string; weight_kg: number }[]) ?? []).map((r) => ({
    date: r.date,
    weight_kg: Number(r.weight_kg),
  }));
}

// Recent activity (steps / burn / sleep), oldest→newest, for the charts.
export async function getActivityHistory(days = 14): Promise<Activity[]> {
  const supabase = await createClient();
  const cut = isoDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const { data } = await supabase
    .from("activity")
    .select("date, steps, workout_kcal, sleep_hours, source")
    .gte("date", cut)
    .order("date", { ascending: true });
  return (data as Activity[]) ?? [];
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
