import Link from "next/link";
import PantryForm from "./PantryForm";
import PantryList from "./PantryList";
import { createClient } from "@/lib/supabase/server";
import type { PantryItem } from "@/lib/types";

export default async function PantryPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pantry_items")
    .select(
      "id, name, off_barcode, quantity, kcal_100g, protein_100g, carbs_100g, fat_100g",
    )
    .order("created_at", { ascending: false });

  const items = (data as PantryItem[]) ?? [];

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back"
          className="text-xl text-black/40 dark:text-white/40"
        >
          ←
        </Link>
        <h1 className="text-2xl font-extrabold">Pantry</h1>
      </div>

      <PantryList items={items} />
      <PantryForm />
    </main>
  );
}
