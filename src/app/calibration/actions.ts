"use server";

import { redirect } from "next/navigation";
import { applyReview } from "@/app/(app)/coach/actions";

// Start the deficit the calibration review just explained.
//
// This is the consent step for the biggest macro change the app ever makes: the
// user has seen the measurement, the new target and the rate it should produce
// before anything is written. applyReview does the writing — same action the
// Coach screen uses — so there is one path that changes a target, not two.
export async function startDeficit() {
  await applyReview();
  redirect("/");
}
