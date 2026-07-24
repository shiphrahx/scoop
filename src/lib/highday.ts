// Calorie/carb cycling ("high days") — pure maths, no AI, no DB.
//
// The one rule that must never break: the WEEKLY total is fixed. Fat loss is
// driven by the week's calorie total, not its day-to-day shape; cycling only
// redistributes that fixed total into a few higher-intake days (mostly extra
// carbs) and the rest a little lower, to help adherence and fuel workouts.
//
// So a high day ADDS a carb surplus and each low day SUBTRACTS a share of it,
// sized precisely so the seven days sum back to seven flat days. Carbs are the
// only lever: protein holds steady all week (it protects muscle in a deficit),
// and fat holds too. Energy moves only as far as the carbs do (4 kcal/g).

import type { Phase } from "@/lib/coach";
import type { GoalPace, Macros, Profile } from "@/lib/types";

export const WEEK_DAYS = 7;

// Grams of extra carbs a high day adds, by default. Tunable per user
// (users.high_day_surplus_g_carbs); ~75 g ≈ 300 kcal, a meaningful refeed
// without swallowing the week.
export const DEFAULT_SURPLUS_CARBS_G = 75;

// Recommended high days per week by loss pace. Faster loss leaves less room in
// the week to move calories around, so it earns fewer high days; a gentle pace
// (or maintenance) can carry more. Exposed so the mapping is easy to tune.
export const HIGH_DAYS_BY_PACE: Record<GoalPace, number> = {
  aggressive: 1,
  steady: 2,
  gentle: 3,
};

// Someone holding at maintenance (goal reached, or a diet break) has the most
// freedom to cycle, so they get the top of the range.
export const MAINTENANCE_HIGH_DAYS = 3;

// The high-days count to recommend for a user's goal. Maintenance overrides the
// pace, since at maintenance the pace no longer describes what they're doing.
export function recommendedHighDays(pace: GoalPace, phase: Phase = "deficit"): number {
  if (phase === "maintenance") return MAINTENANCE_HIGH_DAYS;
  return HIGH_DAYS_BY_PACE[pace];
}

// A user's cycling settings, as the app holds them.
export interface CycleConfig {
  enabled: boolean;
  // How many high days a week. Kept in the allowed range [0, WEEK_DAYS - 1] by
  // effectiveHighDays; there must be at least one low day to give the surplus
  // back to, so it can never reach WEEK_DAYS.
  highDaysPerWeek: number;
  surplusCarbsG: number;
}

// The high-days count actually used: the user's own, clamped to a sane range.
// A NULL user override is resolved to the recommendation BEFORE this — callers
// pass a concrete number. At least one low day must remain to absorb the
// surplus, hence the WEEK_DAYS - 1 ceiling.
export function effectiveHighDays(highDaysPerWeek: number): number {
  if (!Number.isFinite(highDaysPerWeek)) return 0;
  return Math.max(0, Math.min(WEEK_DAYS - 1, Math.floor(highDaysPerWeek)));
}

// Grams of carbs each LOW day gives up, so the week nets to zero:
//   lowDrop × lowDays = surplus × highDays
// With highDays high days and (WEEK_DAYS − highDays) low days, this is exactly
// what keeps the seven-day carb (and therefore calorie) total unchanged.
// Returns 0 when there are no high days, or no low days to draw from.
export function lowDayCarbDrop(
  surplusCarbsG: number,
  highDaysPerWeek: number,
  weekDays: number = WEEK_DAYS,
): number {
  const high = effectiveHighDays(highDaysPerWeek);
  const low = weekDays - high;
  if (high <= 0 || low <= 0 || !(surplusCarbsG > 0)) return 0;
  return (surplusCarbsG * high) / low;
}

// The carb delta applied to a single day: up by the full surplus on a high day,
// down by each low day's share otherwise. High days that don't exist (allowance
// 0) leave every day flat.
export function dayCarbDelta(isHigh: boolean, cfg: CycleConfig): number {
  const high = effectiveHighDays(cfg.highDaysPerWeek);
  if (!cfg.enabled || high <= 0) return 0;
  return isHigh
    ? cfg.surplusCarbsG
    : -lowDayCarbDrop(cfg.surplusCarbsG, high);
}

// One day's macro target, high or low, derived from the flat base target by
// moving CARBS only. Protein, fat and the micro targets are the base's — carbs
// are the lever, and energy follows the carbs at 4 kcal/g. Carbs never go
// negative (a huge surplus on a tiny base just floors the low day at zero;
// that edge can't preserve the exact weekly total, but normal settings do).
//
// The numbers are intentionally NOT rounded here: the weekly invariant is exact
// on the raw values. Round at the display boundary (see roundMacros).
export function dayTarget(base: Macros, isHigh: boolean, cfg: CycleConfig): Required<Macros> {
  const full: Required<Macros> = {
    kcal: base.kcal,
    protein_g: base.protein_g,
    carbs_g: base.carbs_g,
    fat_g: base.fat_g,
    fiber_g: base.fiber_g ?? 0,
    sugar_g: base.sugar_g ?? 0,
    satfat_g: base.satfat_g ?? 0,
    sodium_mg: base.sodium_mg ?? 0,
  };
  const delta = dayCarbDelta(isHigh, cfg);
  if (delta === 0) return full;

  const carbs_g = Math.max(0, full.carbs_g + delta);
  const appliedDelta = carbs_g - full.carbs_g; // 0-floor may shrink a low drop
  return { ...full, carbs_g, kcal: full.kcal + appliedDelta * 4 };
}

// Whole-number macros for showing on a ring or a plan line.
export function roundMacros(m: Required<Macros>): Required<Macros> {
  return {
    kcal: Math.round(m.kcal),
    protein_g: Math.round(m.protein_g),
    carbs_g: Math.round(m.carbs_g),
    fat_g: Math.round(m.fat_g),
    fiber_g: Math.round(m.fiber_g),
    sugar_g: Math.round(m.sugar_g),
    satfat_g: Math.round(m.satfat_g),
    sodium_mg: Math.round(m.sodium_mg),
  };
}

// The weekly high-day allowance for a user: their own chosen count, or the
// recommendation for their goal when they haven't set one (high_days_per_week
// NULL). A goal change therefore re-recommends without overwriting a manual
// choice — the choice lives in the column, the recommendation is derived.
export function resolveHighDaysAllowance(
  profile: Pick<Profile, "high_days_per_week" | "goal_pace">,
  phase: Phase = "deficit",
): number {
  const chosen = profile.high_days_per_week;
  return effectiveHighDays(
    chosen != null ? chosen : recommendedHighDays(profile.goal_pace, phase),
  );
}

// A user's whole cycling config, ready for dayTarget — the master switch, the
// resolved allowance, and the carb surplus.
export function cycleConfigFrom(
  profile: Pick<
    Profile,
    "cycling_enabled" | "high_days_per_week" | "goal_pace" | "high_day_surplus_g_carbs"
  >,
  phase: Phase = "deficit",
): CycleConfig {
  return {
    enabled: profile.cycling_enabled,
    highDaysPerWeek: resolveHighDaysAllowance(profile, phase),
    surplusCarbsG: profile.high_day_surplus_g_carbs,
  };
}

// High days still available this week: the weekly allowance minus the ones
// already taken. Never negative. When the count reaches zero the planner blocks
// taking another until the week rolls over (a fresh week_start, zero taken).
export function highDaysRemaining(allowance: number, takenThisWeek: number): number {
  return Math.max(0, effectiveHighDays(allowance) - Math.max(0, takenThisWeek));
}
