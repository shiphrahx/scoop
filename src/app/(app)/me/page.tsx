import { User } from "lucide-react";
import ApiKeySettings from "./ApiKeySettings";
import GoalsSettings from "./GoalsSettings";
import MealSlotsSettings from "./MealSlotsSettings";
import { DEFAULT_MEAL_SLOTS } from "@/lib/types";
import SignOutButton from "@/components/SignOutButton";
import {
  AppleIngest,
  DevSeed,
  FitbitButton,
} from "@/app/(app)/coach/Controls";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hasApiKey } from "@/lib/queries";

// Turn the ?fitbit= result of the OAuth round-trip into a one-line banner.
const FITBIT_NOTES: Record<string, string> = {
  connected: "Fitbit connected. Tap sync to pull your data.",
  denied: "Fitbit connection was cancelled.",
  error: "Something went wrong connecting Fitbit. Try again.",
};

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ fitbit?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ fitbit }, profile, connected] = await Promise.all([
    searchParams,
    getProfile(),
    hasApiKey(),
  ]);

  const [fitbitRes, tokenRes] = await Promise.all([
    user
      ? supabase.from("fitbit_tokens").select("user_id").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("users").select("apple_ingest_token").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const fitbitConnected = Boolean(
    (fitbitRes.data as { user_id: string } | null)?.user_id,
  );
  const appleToken =
    (tokenRes.data as { apple_ingest_token: string | null } | null)
      ?.apple_ingest_token ?? null;
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
      </section>

      <ApiKeySettings connected={connected} />

      <div className="flex justify-center pt-2">
        <SignOutButton />
      </div>
    </main>
  );
}
