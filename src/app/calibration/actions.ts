"use server";

import { redirect } from "next/navigation";
import { applyReview } from "@/app/(app)/coach/actions";
import { requireUser } from "@/lib/auth";
import { logError } from "@/lib/log";
import { getCalibrationWrap, getProfile } from "@/lib/queries";

// Start the deficit the calibration review just explained.
//
// This is the consent step for the biggest macro change the app ever makes: the
// user has seen the measurement, the new target and the rate it should produce
// before anything is written. applyReview does the writing — same action the
// Coach screen uses — so there is one path that changes a target, not two.
//
// The findings are read BEFORE the target is written and filed AFTER it: reading
// after would find nothing (writing the target is exactly what ends the review),
// and filing before would leave a stored review behind for a deficit that never
// started if the write failed.
export async function startDeficit() {
  const [wrap, profile] = await Promise.all([getCalibrationWrap(), getProfile()]);

  await applyReview();

  if (wrap && profile?.calibration_started_at) {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("calibration_reviews").insert({
      user_id: user.id,
      started_at: profile.calibration_started_at,
      days: wrap.days,
      findings: wrap,
    });
    // The target is already written by this point. Losing the keepsake copy of
    // the review is worth reporting, but not worth failing the action the user
    // actually pressed the button for.
    if (error) logError(`calibration review for user ${user.id}`, new Error(error.message));
  }

  redirect("/");
}
