// Refeed days ("high days") — pure maths, no AI, no DB.
//
// The model the successful studies use (Campbell/ICECAP refeeds, MATADOR diet
// breaks): a refeed day eats UP TO maintenance and is FREE — nothing is
// subtracted from any other day to pay for it. Deficit days stay exactly at
// their normal deficit macros. This deliberately makes the week's deficit a
// little smaller on weeks with refeeds; that cost is shown honestly rather than
// hidden by borrowing carbs back from other days (which pushed low days too low).
//
// Carbs are the only lever: protein holds identical every day (it protects
// muscle in a deficit), fat holds steady, and the gap between the deficit target
// and maintenance is filled with carbs — capped so a refeed never exceeds
// maintenance.

import type { Phase } from "@/lib/coach";
import type { GoalPace, Macros, Profile } from "@/lib/types";

export const WEEK_DAYS = 7;

// The count the user may dial to, around the evidence-based default. A refeed is
// a couple of days a week; more than that and it stops being a deficit.
export const HIGH_DAYS_SAFE_MIN = 1;
export const HIGH_DAYS_SAFE_MAX = 3;

// Clamp a user's chosen refeed-day count to the safe adjustable range.
export function clampHighDaysChoice(n: number): number {
  if (!Number.isFinite(n)) return HIGH_DAYS_SAFE_MIN;
  return Math.max(HIGH_DAYS_SAFE_MIN, Math.min(HIGH_DAYS_SAFE_MAX, Math.round(n)));
}

// Two refeed days a week is the evidence-based default (Campbell/ICECAP): enough
// to help adherence and refill glycogen without eroding the week's deficit. The
// pace no longer changes this — because refeeds are now FREE (a refeed day eats
// at maintenance and no other day pays it back), a faster pace doesn't need
// fewer of them to stay balanced; it just means each refeed costs a little of
// that week's deficit, which the projection shows honestly.
export const REFEED_DAYS_DEFAULT = 2;

// Kept for callers/tests that still read a per-pace map; every pace now defaults
// to the same evidence-based count.
export const HIGH_DAYS_BY_PACE: Record<GoalPace, number> = {
  aggressive: REFEED_DAYS_DEFAULT,
  steady: REFEED_DAYS_DEFAULT,
  gentle: REFEED_DAYS_DEFAULT,
};

// At maintenance there's no deficit to protect, so a third refeed day is fine.
export const MAINTENANCE_HIGH_DAYS = 3;

// The refeed-day count to recommend. Refeeds are only offered once the deficit is
// real and maintenance is calibrated, so calibration recommends none.
export function recommendedHighDays(pace: GoalPace, phase: Phase = "deficit"): number {
  if (phase === "calibration") return 0;
  if (phase === "maintenance") return MAINTENANCE_HIGH_DAYS;
  return REFEED_DAYS_DEFAULT;
}

// A user's refeed settings, as the app holds them.
export interface CycleConfig {
  enabled: boolean;
  // How many refeed days a week the user is allowed. Only the count is set here;
  // the user still picks WHICH days.
  refeedDaysPerWeek: number;
  // The calorie ceiling a refeed day is raised to. Null when maintenance isn't
  // confidently estimated yet (still calibrating) — in which case no refeed
  // uplift is applied and every day stays at its deficit target.
  maintenanceKcal: number | null;
}

// The high-days count actually used: the user's own, clamped to a sane range.
// A NULL user override is resolved to the recommendation BEFORE this — callers
// pass a concrete number. At least one low day must remain to absorb the
// surplus, hence the WEEK_DAYS - 1 ceiling.
export function effectiveHighDays(highDaysPerWeek: number): number {
  if (!Number.isFinite(highDaysPerWeek)) return 0;
  return Math.max(0, Math.min(WEEK_DAYS - 1, Math.floor(highDaysPerWeek)));
}

// Energy per kg of body mass, for turning a weekly calorie deficit into a rate.
const KCAL_PER_KG = 7700;

// The week's calorie deficit once refeed days are counted. Each refeed day sits
// AT maintenance (zero deficit that day); the rest keep the full daily deficit.
// Because refeeds are free, this is genuinely smaller than seven deficit days —
// the honest number to project a rate from, not the flat 7-day figure.
export function weeklyDeficitKcal(dailyDeficitKcal: number, refeedDays: number): number {
  const refeeds = Math.max(0, Math.min(WEEK_DAYS, Math.round(refeedDays)));
  return Math.max(0, dailyDeficitKcal) * (WEEK_DAYS - refeeds);
}

// Expected weekly weight loss (kg) implied by a weekly calorie deficit.
export function expectedWeeklyLossKg(weekDeficitKcal: number): number {
  return Math.max(0, weekDeficitKcal) / KCAL_PER_KG;
}

// The extra carbs a refeed day carries: the whole gap between the deficit target
// and maintenance, since carbs are the only macro that moves. Zero when cycling
// is off, maintenance isn't known, or the base already meets maintenance.
export function refeedCarbUpliftG(base: Pick<Macros, "kcal">, cfg: CycleConfig): number {
  if (!cfg.enabled || cfg.maintenanceKcal == null) return 0;
  const gapKcal = cfg.maintenanceKcal - base.kcal;
  return gapKcal > 0 ? gapKcal / 4 : 0;
}

// One day's macro target. A deficit day is the base target, untouched. A refeed
// day is raised UP TO maintenance (never above) by adding carbs only — protein
// and fat are the base's, and the micro targets carry through. No other day is
// altered to pay for it: refeeds are free, so the week's deficit is genuinely
// smaller, and the projection reflects that (see coach maths).
//
// Not rounded here — round at the display boundary (see roundMacros).
export function dayTarget(base: Macros, isRefeed: boolean, cfg: CycleConfig): Required<Macros> {
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
  if (!isRefeed) return full;

  const upliftG = refeedCarbUpliftG(full, cfg);
  if (upliftG <= 0) return full;
  return { ...full, carbs_g: full.carbs_g + upliftG, kcal: full.kcal + upliftG * 4 };
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
  // No high days during calibration, even if the user set a count before — the
  // deficit hasn't started, so there's nothing to cycle around.
  if (phase === "calibration") return 0;
  const chosen = profile.high_days_per_week;
  return effectiveHighDays(
    chosen != null ? chosen : recommendedHighDays(profile.goal_pace, phase),
  );
}

// A user's whole refeed config, ready for dayTarget — the master switch, the
// resolved count, and the maintenance ceiling a refeed is raised to. Refeeds are
// only offered once the deficit is real AND maintenance is confidently estimated:
// during calibration (the learning window) there's nothing to refeed from, and
// without a maintenance figure a refeed has no ceiling to aim at, so both cases
// disable cycling and leave every day at its deficit target.
export function cycleConfigFrom(
  profile: Pick<Profile, "cycling_enabled" | "high_days_per_week" | "goal_pace">,
  phase: Phase = "deficit",
  // The user's best maintenance estimate. Null/absent when it isn't well
  // estimated yet — refeeds are not pushed until it is.
  maintenanceKcal?: number | null,
): CycleConfig {
  if (phase === "calibration") {
    return { enabled: false, refeedDaysPerWeek: 0, maintenanceKcal: null };
  }
  const confidentMaintenance =
    maintenanceKcal != null && maintenanceKcal > 0 ? maintenanceKcal : null;
  return {
    enabled: profile.cycling_enabled && confidentMaintenance != null,
    refeedDaysPerWeek: resolveHighDaysAllowance(profile, phase),
    maintenanceKcal: confidentMaintenance,
  };
}

// High days still available this week: the weekly allowance minus the ones
// already taken. Never negative. When the count reaches zero the planner blocks
// taking another until the week rolls over (a fresh week_start, zero taken).
export function highDaysRemaining(allowance: number, takenThisWeek: number): number {
  return Math.max(0, effectiveHighDays(allowance) - Math.max(0, takenThisWeek));
}
