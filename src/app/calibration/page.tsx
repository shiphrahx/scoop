import { redirect } from "next/navigation";
import { getCalibrationWrap, getProfile } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import CalibrationReview from "./CalibrationReview";

// The calibration review lives outside the (app) group on purpose: no bottom
// nav, no sidebar, nothing to tap but the review itself. It is shown once, at
// the one moment it exists, and ends by starting the deficit.
export const metadata = { title: "Calibration complete" };

export default async function CalibrationPage() {
  const [user, profile] = await Promise.all([getSessionUser(), getProfile()]);
  if (!user) redirect("/login");
  if (!profile?.onboarded_at) redirect("/onboarding");

  // Null means there is no review pending, the hold is still running, or the
  // deficit has already been started. Either way there is nothing to show.
  const wrap = await getCalibrationWrap();
  if (!wrap) redirect("/");

  const name =
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? null;

  return <CalibrationReview wrap={wrap} name={name} />;
}
