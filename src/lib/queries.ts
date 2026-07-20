import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import {
  TREND_WINDOW_DAYS,
  trendChange,
  weeklyReview,
  type TrendChange,
  type WeeklyReview,
} from "@/lib/coach";
import {
  DEFAULT_TIMEZONE,
  dayRangeFor,
  localDate,
  localWeekStart,
  safeTimezone,
  startOfLocalDay,
} from "@/lib/time";
import type {
  Activity,
  DailyTargets,
  FreshFood,
  FreshFoodSize,
  Macros,
  PlannedMeal,
  Profile,
} from "@/lib/types";

// The timezone the signed-in user lives in, falling back to UTC. Every day
// boundary below is drawn with it: the server's clock is UTC, which is not the
// user's day (see src/lib/time.ts).
export async function getTimezone(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_TIMEZONE;

  const { data } = await supabase
    .from("users")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  return safeTimezone((data as { timezone: string | null } | null)?.timezone);
}

// Today's date where the user is, as YYYY-MM-DD. Used for the planned_meals.date
// column so a plan lines up with the calendar day they're actually living in.
export async function localToday(): Promise<string> {
  return localDate(await getTimezone());
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
  const tz = await getTimezone();
  // Prefer this week's target; fall back to the most recent one. The week turns
  // over on the user's Monday, not the server's.
  const { data } = await supabase
    .from("daily_targets")
    .select("week_start, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg")
    .lte("week_start", localWeekStart(tz))
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as DailyTargets) ?? null;
}

export async function getTodayConsumed(): Promise<Macros> {
  return getConsumedForDate(await localToday());
}

// Food logged on one calendar day where the user lives, summed. Bounded on both
// ends so a past day stops at its own midnight instead of running to now.
export async function getConsumedForDate(date: string): Promise<Macros> {
  const supabase = await createClient();
  const { start, end } = dayRangeFor(await getTimezone(), date);

  const { data } = await supabase
    .from("food_logs")
    .select("kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg")
    .gte("logged_at", start.toISOString())
    .lt("logged_at", end.toISOString());

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
  return getPlanForDate(await localToday());
}

// One calendar day's saved plan (all slots), ordered as the user arranged them.
export async function getPlanForDate(date: string): Promise<PlannedMeal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planned_meals")
    .select(
      "id, date, slot, position, origin, name, items, picks, portions, swaps, why, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, satfat_g, sodium_mg, logged_food_id",
    )
    .eq("date", date)
    .order("position", { ascending: true });

  return ((data as PlannedMeal[]) ?? []).map((m) => ({
    ...m,
    picks: m.picks ?? [],
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
  const start = startOfLocalDay(await getTimezone());
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
  // Movement of the smoothed trend weight over the last week, and where that
  // trend sits today. Null when there aren't enough weigh-ins to span a week.
  trend: TrendChange | null;
  trendWeightKg: number | null;
  waistDeltaCm: number | null;
  activity: Activity[];
  fitbitConnected: boolean;
  appleIngestToken: string | null;
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// How far back a waist measurement can be and still count as "the previous
// one" for the weekly review.
const WAIST_WINDOW_DAYS = 28;

export async function getCoachData(): Promise<CoachData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const tz = await getTimezone();
  // The weeks the review compares are the user's weeks: both cut-offs and the
  // week boundary are drawn in their zone, or a weigh-in near midnight lands in
  // the wrong week and skews the average the coach acts on.
  const cutDay = (daysBack: number) =>
    localDate(tz, new Date(now.getTime() - daysBack * DAY_MS));
  const cut7 = cutDay(6); // last 7 days incl today
  const cut14 = cutDay(13);
  // The trend filter reads a month of weigh-ins. It only needs a week's worth to
  // report a rate, but the extra history is what makes the rate steady.
  const cutTrend = cutDay(TREND_WINDOW_DAYS - 1);
  // The waist gate can only speak for the week under review. Unbounded, the
  // "previous" tape reading could be from months ago, and a long-since-earned
  // -4 cm would read as this week's progress and hold a genuine plateau open
  // for ever. Measurements are weekly, so a month covers a real pair.
  const cutWaist = cutDay(WAIST_WINDOW_DAYS - 1);

  const [profile, current, weightsRes, measRes, activityRes, fitbitRes, tokenRes] =
    await Promise.all([
      getProfile(),
      getCurrentTargets(),
      supabase
        .from("weights")
        .select("date, weight_kg")
        .gte("date", cutTrend)
        .order("date", { ascending: false }),
      supabase
        .from("measurements")
        .select("date, waist_cm")
        .not("waist_cm", "is", null)
        .gte("date", cutWaist)
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
  const trend = trendChange(
    weights.map((w) => ({ date: w.date, kg: Number(w.weight_kg) })),
  );

  const meas = (measRes.data as { waist_cm: number }[]) ?? [];
  const waistDeltaCm =
    meas.length >= 2 ? Number(meas[0].waist_cm) - Number(meas[1].waist_cm) : null;

  // Consistency gate: the trend can produce a number from very little, but a
  // number built on two weigh-ins a fortnight apart isn't one to change someone's
  // food over. Ask for a real cadence at both ends of the comparison window.
  const MIN_WEIGH_INS = 3;
  const inLastWeek = weights.filter((w) => w.date >= cut7).length;
  const inWeekBefore = weights.filter((w) => w.date >= cut14 && w.date < cut7).length;
  const consistent = inLastWeek >= MIN_WEIGH_INS && inWeekBefore >= MIN_WEIGH_INS;

  // Adaptation gate: how many whole weeks the current calorie target has been
  // unchanged. The review won't cut or add until the body has had ~2 weeks to
  // respond. We measure it as the span from the start of the current unbroken
  // run of same-kcal weekly targets up to this week.
  const thisWeekStart = localWeekStart(tz, now);
  let weeksOnTarget = 0;
  if (current) {
    const { data: histData } = await supabase
      .from("daily_targets")
      .select("week_start, kcal")
      .lte("week_start", thisWeekStart)
      .order("week_start", { ascending: false })
      .limit(12);
    const hist = (histData as { week_start: string; kcal: number }[]) ?? [];
    let runStart = thisWeekStart;
    for (const row of hist) {
      if (Math.round(Number(row.kcal)) === Math.round(current.kcal)) {
        runStart = row.week_start;
      } else {
        break;
      }
    }
    weeksOnTarget = Math.round(
      (Date.parse(thisWeekStart) - Date.parse(runStart)) / (7 * DAY_MS),
    );
  }

  const sex = profile?.sex ?? "female";
  const review = current
    ? weeklyReview({
        sex,
        diet: profile?.diet_type ?? "regular",
        trend,
        waistDeltaCm,
        current,
        // Keep the protein cap consistent with onboarding when we recompute.
        heightCm: profile?.height_cm,
        goalWeightKg: profile?.goal_weight_kg,
        // Cadence gates — hold unless the target is ≥2 weeks old and the
        // weigh-ins are consistent.
        weeksOnTarget,
        consistent,
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
    trend,
    trendWeightKg: trend?.nowKg ?? null,
    waistDeltaCm,
    activity: (activityRes.data as Activity[]) ?? [],
    fitbitConnected: Boolean((fitbitRes.data as { user_id: string } | null)?.user_id),
    appleIngestToken: (() => {
      const stored = (tokenRes.data as { apple_ingest_token: string | null } | null)
        ?.apple_ingest_token;
      return stored ? decryptSecret(stored) : null;
    })(),
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

// Fresh whole foods from the shared reference whose name matches what the user
// is typing, each with its sizes attached, best-effort ranked with exact/prefix
// matches first. Empty for a query shorter than two characters (too broad).
// Read in two steps — foods, then their sizes — so it works without a nested
// join (and against the test fake). Numeric columns arrive as strings from
// PostgREST, so every macro and gram is coerced to a number here.
export async function searchFreshFoods(query: string): Promise<FreshFood[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data: foodData } = await supabase
    .from("fresh_foods")
    .select(
      "id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, cooked",
    )
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(8);

  const foods = (foodData as (Omit<FreshFood, "sizes"> & Record<string, unknown>)[]) ?? [];
  if (foods.length === 0) return [];

  const { data: sizeData } = await supabase
    .from("fresh_food_sizes")
    .select("id, food_id, label, grams")
    .in(
      "food_id",
      foods.map((f) => f.id),
    );
  const sizes = (sizeData as FreshFoodSize[]) ?? [];

  const ql = q.toLowerCase();
  const rank = (name: string) => {
    const n = name.toLowerCase();
    if (n === ql) return 0;
    if (n.startsWith(ql)) return 1;
    return 2;
  };

  return foods
    .map((f) => ({
      id: f.id,
      name: f.name,
      kcal_100g: Number(f.kcal_100g),
      protein_100g: Number(f.protein_100g),
      carbs_100g: Number(f.carbs_100g),
      fat_100g: Number(f.fat_100g),
      fiber_100g: Number(f.fiber_100g),
      sugar_100g: Number(f.sugar_100g),
      satfat_100g: Number(f.satfat_100g),
      sodium_mg_100g: Number(f.sodium_mg_100g),
      cooked: Boolean(f.cooked),
      sizes: sizes
        .filter((s) => s.food_id === f.id)
        .map((s) => ({ label: s.label, grams: Number(s.grams) }))
        .sort((a, b) => a.grams - b.grams),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
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
