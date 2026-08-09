import { notFound, redirect } from "next/navigation";
import { getCalibrationReview, getProfile } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import CalibrationReview from "../CalibrationReview";

// A filed calibration review, re-watched. Same cards as the day it was shown —
// they are read from the stored snapshot, not recomputed, because the inputs
// have all moved on since (see migration 0033).
export const metadata = { title: "Calibration review" };

export default async function FiledReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user, profile] = await Promise.all([
    params,
    getSessionUser(),
    getProfile(),
  ]);
  if (!user) redirect("/login");
  if (!profile?.onboarded_at) redirect("/onboarding");

  // RLS filters another user's review out rather than erroring, so "not mine"
  // and "not there" arrive here as the same thing, and are answered the same way.
  const filed = await getCalibrationReview(id);
  if (!filed) notFound();

  const name =
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? null;

  return (
    <CalibrationReview
      wrap={filed.findings}
      name={name}
      replay
      endedAt={filed.endedAt}
    />
  );
}
