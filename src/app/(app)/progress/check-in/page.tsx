import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentCheckIn, getPreviousCheckIn } from "@/lib/queries";
import CheckInForm from "./CheckInForm";

// The weekly check-in screen: a dedicated, big-tap form for measurements, an
// optional weight and note, and optional private photos. Reached from Progress.
// Prefills from this week's check-in if it's already been done (editing), else
// from the previous week's so the numbers start near where they were.
export default async function CheckInPage() {
  const [current, previous] = await Promise.all([
    getCurrentCheckIn(),
    getPreviousCheckIn(),
  ]);

  const prefill = current ?? previous;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link
          href="/progress"
          className="grid h-10 w-10 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
          aria-label="Back to Progress"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-3xl font-semibold">
          {current ? "Edit this week" : "Weekly check-in"}
        </h1>
      </div>

      <p className="text-[var(--muted)]">
        Take your measurements once a week. Everything here is optional. Fill in
        what you measured. It feeds your trends and the Coach.
      </p>

      <CheckInForm
        alreadyDone={Boolean(current)}
        prefill={{
          chest_cm: prefill?.chest_cm ?? null,
          waist_cm: prefill?.waist_cm ?? null,
          arms_cm: prefill?.arms_cm ?? null,
          thighs_cm: prefill?.thighs_cm ?? null,
          hips_cm: prefill?.hips_cm ?? null,
          weight_kg: current?.weight_kg ?? null,
          note: current?.note ?? null,
        }}
      />
    </main>
  );
}
