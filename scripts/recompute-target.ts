// One-off admin util: recompute and overwrite a single user's CURRENT-week
// macro target. The app recomputes on the /me "Save goals" action, but when a
// coach-math change (e.g. a new activity factor) lands, existing stored targets
// keep their old numbers until something writes a fresh row. This does that
// write for one user, using the exact same inputs and math as saveGoals.
//
// Run:  node scripts/recompute-target.ts <email>
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
//
// coach.ts and time.ts have only type-imports / no imports, so Node's native
// TypeScript stripping runs this without any alias resolution or build step.

import pkg from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = pkg;
import {
  ageFromBirthYear,
  averageActiveKcal,
  dailyTarget,
  maintenanceTarget,
} from "../src/lib/coach.ts";
import { localWeekStart } from "../src/lib/time.ts";

const ACTIVE_WINDOW_DAYS = 7;

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: node scripts/recompute-target.ts <email>");
    process.exit(1);
  }

  loadEnvConfig(process.cwd(), true);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey);

  // The user and everything the target depends on.
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select(
      "id, timezone, diet_type, activity_level, goal_pace, height_cm, sex, birth_year, body_fat_pct, goal_weight_kg, tdee_calibration",
    )
    .eq("email", email)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user) {
    console.error(`no user with email ${email}`);
    process.exit(1);
  }

  if (!user.height_cm || !user.sex || !user.birth_year) {
    console.error("profile incomplete (height/sex/birth_year), nothing to compute");
    process.exit(1);
  }

  const { data: w } = await supabase
    .from("weights")
    .select("weight_kg")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const weightKg = w ? Number(w.weight_kg) : null;
  if (!weightKg) {
    console.error("no weight logged, nothing to compute");
    process.exit(1);
  }

  const cut7 = new Date(Date.now() - (ACTIVE_WINDOW_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: act } = await supabase
    .from("activity")
    .select("workout_kcal, date")
    .eq("user_id", user.id)
    .gte("date", cut7);
  const activeKcalPerDay = averageActiveKcal(
    (act ?? []).map((r) => r.workout_kcal),
    ACTIVE_WINDOW_DAYS,
  );

  const weekStart = localWeekStart(user.timezone ?? "UTC");
  const { data: curTarget } = await supabase
    .from("daily_targets")
    .select("phase, kcal")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();
  const curPhase = curTarget?.phase ?? null;
  const calibrating = curPhase === "calibration";

  const macroInput = {
    sex: user.sex,
    diet: user.diet_type,
    weightKg,
    heightCm: Number(user.height_cm),
    age: ageFromBirthYear(user.birth_year),
    activity: user.activity_level,
    activeKcalPerDay,
    bodyFatPct: user.body_fat_pct,
    goalWeightKg: user.goal_weight_kg,
    tdeeCalibration: user.tdee_calibration,
  };
  const target = calibrating
    ? maintenanceTarget(macroInput)
    : dailyTarget({ ...macroInput, pace: user.goal_pace });

  console.log("before:", curTarget?.kcal ?? "(none)", "kcal");
  console.log("inputs:", {
    weekStart,
    phase: curPhase ?? "deficit",
    activeKcalPerDay,
    calibrating,
  });

  const { error: upErr } = await supabase.from("daily_targets").upsert(
    {
      user_id: user.id,
      week_start: weekStart,
      phase: curPhase ?? "deficit",
      ...target,
    },
    { onConflict: "user_id,week_start" },
  );
  if (upErr) throw upErr;

  console.log("after: ", target.kcal, "kcal", target);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
