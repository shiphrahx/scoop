import Link from "next/link";
import BatchForm from "./BatchForm";
import BatchList from "./BatchList";
import { createClient } from "@/lib/supabase/server";
import type { Batch } from "@/lib/types";

export default async function BatchesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("batches")
    .select(
      "id, name, source_packs, total_cooked_g, remaining_g, kcal, protein_g, carbs_g, fat_g",
    )
    .order("created_at", { ascending: false });

  const batches = (data as Batch[]) ?? [];

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back"
          className="text-2xl text-[var(--muted)]"
        >
          ←
        </Link>
        <h1 className="text-3xl font-black">Batch cooking</h1>
      </div>

      <BatchList batches={batches} />
      <BatchForm />
    </main>
  );
}
