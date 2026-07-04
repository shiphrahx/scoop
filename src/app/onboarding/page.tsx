import { redirect } from "next/navigation";
import { getProfile } from "@/lib/queries";
import OnboardingFlow from "./OnboardingFlow";

export default async function OnboardingPage() {
  const profile = await getProfile();
  if (profile?.onboarded_at) redirect("/");
  return <OnboardingFlow />;
}
