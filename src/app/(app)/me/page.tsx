import { User } from "lucide-react";
import CalibrationSettings from "./CalibrationSettings";
import CyclingSettings from "./CyclingSettings";
import GoalsSettings from "./GoalsSettings";
import MealSlotsSettings from "./MealSlotsSettings";
import NutrientSettings from "./NutrientSettings";
import SlotWeightsSettings from "./SlotWeightsSettings";
import { DEFAULT_MEAL_SLOTS } from "@/lib/types";
import { recommendedHighDays } from "@/lib/highday";
import { calibrationDaysElapsed } from "@/lib/coach";
import SignOutButton from "@/components/SignOutButton";
import InstallAppButton from "@/components/InstallAppButton";
import {
  AppleIngest,
  DevSeed,
  FitbitButton,
} from "@/app/(app)/coach/Controls";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import {
  getAppleIngestToken,
  getCurrentTargets,
  getLatestWeight,
  getProfile,
  maintenanceKcalFor,
} from "@/lib/queries";

// Turn the ?fitbit= result of the OAuth round-trip into a one-line banner.
const FITBIT_NOTES: Record<string, string> = {
  connected: "Fitbit connected. Tap sync to pull your data.",
  denied: "Fitbit connection was cancelled.",
  error: "Something went wrong connecting Fitbit. Try again.",
  // Distinct from `error`: the grant itself worked, it just came back without
  // permission to refresh in the background, which would have stopped syncing
  // within the hour. Saying so beats storing it and failing later.
  offline: "That connection did not include background access, so it would stop working within the hour. Connect again and approve every permission.",
  // Nothing the user can act on — it names the real problem so it isn't mistaken
  // for a connection of theirs that went wrong.
  config: "Device syncing is not set up on this deployment yet.",
};

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ fitbit?: string }>;
}) {
  const supabase = await createClient();
  const user = await getSessionUser();

  // One batch, not two: the fitbit read doesn't depend on the profile batch, so
  // splitting them cost a second sequential round trip for nothing. The Apple
  // token isn't in here at all any more — it lives on the users row getProfile
  // already fetched.
  const [{ fitbit }, profile, targets, weightKg, appleToken, fitbitRes] =
    await Promise.all([
      searchParams,
      getProfile(),
      getCurrentTargets(),
      getLatestWeight(),
      getAppleIngestToken(),
      user
        ? supabase.from("fitbit_tokens").select("user_id").eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const fitbitConnected = Boolean(
    (fitbitRes.data as { user_id: string } | null)?.user_id,
  );
  const note = fitbit ? FITBIT_NOTES[fitbit] : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span
          className="grid h-20 w-20 place-items-center rounded-[1.75rem] text-white"
          style={{ background: "var(--grad-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <User size={40} />
        </span>
        <h1 className="text-3xl font-semibold">Settings</h1>
        {user?.email && (
          <p className="text-sm text-[var(--muted)]">{user.email}</p>
        )}
      </div>

      {note && (
        <p
          className="rounded-2xl px-4 py-3 text-center text-sm font-semibold"
          style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
        >
          {note}
        </p>
      )}

      {profile && (
        <>
          <GoalsSettings
            initial={{
              diet_type: profile.diet_type,
              activity_level: profile.activity_level,
              goal_pace: profile.goal_pace,
            }}
          />
          <MealSlotsSettings
            initial={
              profile.meal_slots?.length ? profile.meal_slots : DEFAULT_MEAL_SLOTS
            }
          />
          <SlotWeightsSettings
            slots={
              profile.meal_slots?.length ? profile.meal_slots : DEFAULT_MEAL_SLOTS
            }
            initial={profile.slot_weights}
          />
          <NutrientSettings initial={profile.nutrient_prefs ?? []} />
          <CyclingSettings
            initial={{
              enabled: profile.cycling_enabled,
              highDaysPerWeek: profile.high_days_per_week,
            }}
            recommended={recommendedHighDays(profile.goal_pace)}
            base={targets ? { kcal: targets.kcal } : null}
            maintenanceKcal={maintenanceKcalFor(profile, weightKg)}
            locked={targets?.phase === "calibration"}
          />
          {/* Days elapsed is pure arithmetic on the stored timestamp, so the
              banner costs no extra read. Whether the hold is RUNNING is read off
              the in-force target rather than recomputed: graduation also needs a
              trustworthy measurement, and only the weekly review is in a position
              to decide that. */}
          <CalibrationSettings
            calibrating={targets?.phase === "calibration"}
            daysElapsed={
              profile.calibration_started_at
                ? calibrationDaysElapsed(profile.calibration_started_at)
                : null
            }
          />
        </>
      )}

      {/* Devices — moved here from the Coach screen. */}
      <section className="flex w-full flex-col gap-4 sc-card p-5">
        <h2 className="text-lg font-semibold">Devices</h2>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Fitbit
          </span>
          <FitbitButton connected={fitbitConnected} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Apple Watch
          </span>
          <AppleIngest initialToken={appleToken} />
        </div>

        {process.env.NODE_ENV !== "production" && <DevSeed />}

        {/* The only way in for someone already signed in: the landing page holds
            the other copy of this, and signed-in visitors are redirected off it
            straight to their dashboard. Renders nothing once installed, or on a
            browser that can't install. */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            This phone
          </span>
          <InstallAppButton className="sc-btn sc-btn-soft w-full py-4 text-lg" />
        </div>
      </section>

      {/* The AI-key section (ApiKeySettings) is deliberately not rendered: the
          bring-your-own-key features aren't finished or tested, so there's
          nothing worth asking for a key for yet. Component kept, not deleted. */}

      <div className="flex justify-center pt-2">
        <SignOutButton />
      </div>
    </main>
  );
}
