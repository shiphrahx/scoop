import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import {
  TREND_WINDOW_DAYS,
  ageFromBirthYear,
  average,
  averageActiveKcal,
  adherence as computeAdherence,
  nextPhase,
  observeTdee,
  restingRate,
  stepsFalling,
  tdee,
  trendChange,
  weeklyReview,
  type Adherence,
  type DailyIntake,
  type Phase,
  type ObservedTdee,
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
  weekStartOf,
} from "@/lib/time";
import {
  cycleConfigFrom,
  dayTarget as dayTargetMacros,
  highDaysRemaining,
  resolveHighDaysAllowance,
  roundMacros,
} from "@/lib/highday";
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

// The high-day picture for one calendar day: whether cycling is on, whether this
// day is a high day, the weekly allowance and how much of it is left, and the
// day's actual macro target (high, low, or — cycling off — the flat base). One
// read the planner and the home ring both build on. `target` is null only when
// there's no base target yet (onboarding unfinished).
export interface HighDayStatus {
  weekStart: string;
  enabled: boolean;
  isHigh: boolean;
  allowance: number;
  taken: number;
  remaining: number;
  surplusCarbsG: number;
  base: DailyTargets | null;
  target: Required<Macros> | null;
}

export async function getHighDayStatus(date: string): Promise<HighDayStatus> {
  const supabase = await createClient();
  const [profile, base] = await Promise.all([getProfile(), getCurrentTargets()]);
  const weekStart = weekStartOf(date);

  // Every high day the user has taken this week (RLS scopes it to them).
  const { data: rows } = await supabase
    .from("high_days")
    .select("date")
    .eq("week_start", weekStart);
  const highDates = ((rows as { date: string }[]) ?? []).map((r) => r.date);
  const isHigh = highDates.includes(date);

  const enabled = profile?.cycling_enabled ?? false;
  const allowance = profile
    ? resolveHighDaysAllowance(profile)
    : 0;
  const surplusCarbsG = profile?.high_day_surplus_g_carbs ?? 0;
  const cfg = profile
    ? cycleConfigFrom(profile)
    : { enabled: false, highDaysPerWeek: 0, surplusCarbsG: 0 };

  return {
    weekStart,
    enabled,
    isHigh,
    allowance,
    taken: highDates.length,
    remaining: highDaysRemaining(allowance, highDates.length),
    surplusCarbsG,
    base,
    target: base ? roundMacros(dayTargetMacros(base, isHigh, cfg)) : null,
  };
}

// The macro target for one day, respecting cycling: a high or low day when it's
// on, the flat base when it's off. Null before onboarding sets a base target.
export async function getDayTarget(date: string): Promise<Required<Macros> | null> {
  return (await getHighDayStatus(date)).target;
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
  // What the user's own numbers say they burn, and the running correction to
  // the formula that it feeds. Null when the data can't support a measurement.
  observed: ObservedTdee | null;
  calibration: number;
  // How closely the user ate this week's target. The review will not cut on a
  // stall the user never actually tested.
  adherence: Adherence | null;
  // Deficit, a planned diet break, or maintenance at the goal weight.
  phase: Phase;
  // The formula's maintenance estimate with NO calibration applied. The
  // correction is the ratio of the measurement to this raw prediction — measure
  // it against an already-corrected number and the ratio sits at 1 for ever and
  // never converges on anything. Null when the profile is too incomplete.
  predictedTdee: number | null;
  activity: Activity[];
  fitbitConnected: boolean;
  appleIngestToken: string | null;
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// How far back a waist measurement can be and still count as "the previous
// one" for the weekly review.
const WAIST_WINDOW_DAYS = 28;

// Calories logged per local day over a window, one entry per day that has any
// food on it. Days with nothing logged are absent rather than zero: a day the
// user didn't log is unknown, not a fast, and scoring it as zero would drag the
// measured intake down and the measured burn with it.
export async function getDailyIntake(
  tz: string,
  windowDays: number,
  now = new Date(),
): Promise<DailyIntake[]> {
  const supabase = await createClient();
  const from = startOfLocalDay(
    tz,
    new Date(now.getTime() - (windowDays - 1) * DAY_MS),
  );

  const { data } = await supabase
    .from("food_logs")
    .select("logged_at, kcal")
    .gte("logged_at", from.toISOString());

  const byDay = new Map<string, number>();
  for (const row of (data as { logged_at: string; kcal: number }[]) ?? []) {
    const day = localDate(tz, new Date(row.logged_at));
    byDay.set(day, (byDay.get(day) ?? 0) + Number(row.kcal));
  }

  return [...byDay.entries()]
    .map(([date, kcal]) => ({ date, kcal }))
    .filter((d) => d.kcal > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

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
        .gte("date", cut14)
        .order("date", { ascending: false })
        .limit(14),
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

  // What the user's own numbers say they burn. This is the measurement that
  // outranks the formula: intake against the slope of their weight.
  const weighIns = weights.map((w) => ({ date: w.date, kg: Number(w.weight_kg) }));
  const intake = await getDailyIntake(tz, TREND_WINDOW_DAYS, now);
  const observed = observeTdee(weighIns, intake);
  const adherence = current ? computeAdherence(intake, current.kcal) : null;
  const calibration =
    profile?.tdee_calibration != null && profile.tdee_calibration > 0
      ? Number(profile.tdee_calibration)
      : 1;

  const activityRows = (activityRes.data as Activity[]) ?? [];
  // This user's own resting metabolism, which sets their real calorie floor.
  const restingRateKcal =
    profile?.height_cm && profile.sex && profile.birth_year && (trend?.nowKg ?? null)
      ? restingRate({
          sex: profile.sex,
          weightKg: trend!.nowKg,
          heightCm: Number(profile.height_cm),
          age: ageFromBirthYear(profile.birth_year),
          bodyFatPct: profile.body_fat_pct,
        })
      : null;
  const thisWeekActivity = activityRows.filter((a) => a.date >= cut7);
  const lastWeekActivity = activityRows.filter((a) => a.date >= cut14 && a.date < cut7);
  const stepsDropped = stepsFalling(
    thisWeekActivity.map((a) => a.steps),
    lastWeekActivity.map((a) => a.steps),
  );
  const stepsPerDay = average(
    thisWeekActivity.map((a) => a.steps).filter((s): s is number => s != null && s > 0),
  );
  const latestKg = trend?.nowKg ?? (weighIns.length ? weighIns[0].kg : null);
  const predictedTdee =
    profile?.height_cm && profile.sex && profile.birth_year && latestKg
      ? tdee({
          sex: profile.sex,
          diet: profile.diet_type ?? "regular",
          weightKg: latestKg,
          heightCm: Number(profile.height_cm),
          age: ageFromBirthYear(profile.birth_year),
          activity: profile.activity_level ?? "sedentary",
          bodyFatPct: profile.body_fat_pct,
          activeKcalPerDay: averageActiveKcal(
            thisWeekActivity.map((a) => a.workout_kcal),
            7,
          ),
          stepsPerDay,
          tdeeCalibration: 1, // deliberately raw — see predictedTdee above
        })
      : null;

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
  let targetHistory: { week_start: string; kcal: number; phase: string | null }[] = [];
  if (current) {
    const { data: histData } = await supabase
      .from("daily_targets")
      .select("week_start, kcal, phase")
      .lte("week_start", thisWeekStart)
      .order("week_start", { ascending: false })
      .limit(26);
    const hist =
      (histData as { week_start: string; kcal: number; phase: string | null }[]) ?? [];
    targetHistory = hist;
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

  // How long the user has been in each state, counted back through the stored
  // weekly targets. This is what tells the coach a diet break is due.
  const countRun = (want: Phase) => {
    let n = 0;
    for (const row of targetHistory) {
      if ((row.phase ?? "deficit") === want) n++;
      else break;
    }
    return n;
  };
  const phase = nextPhase({
    weeksInDeficit: countRun("deficit"),
    weeksInBreak: countRun("diet_break"),
    currentWeightKg: trend?.nowKg ?? latestKg ?? 0,
    goalWeightKg: profile?.goal_weight_kg,
  });

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
        adherence: adherence ?? undefined,
        stepsDropped,
        bodyFatPct: profile?.body_fat_pct,
        restingRateKcal,
        phase,
        // The user's real maintenance, calibrated. Passed in so holding at
        // maintenance never has to be back-derived from the target in force.
        maintenanceKcal:
          predictedTdee != null ? predictedTdee * calibration : null,
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
    observed,
    calibration,
    adherence,
    predictedTdee,
    phase,
    activity: activityRows,
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
