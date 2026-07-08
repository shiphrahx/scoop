import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GroceryScan from "./GroceryScan";
import ListImport from "./ListImport";
import PantryForm from "./PantryForm";
import PantryList from "./PantryList";
import { createClient } from "@/lib/supabase/server";
import { hasApiKey } from "@/lib/queries";
import type { PantryItem } from "@/lib/types";

export default async function PantryPage() {
  const supabase = await createClient();

  const [{ data }, connected] = await Promise.all([
    supabase
      .from("pantry_items")
      .select(
        "id, name, off_barcode, quantity, kcal_100g, protein_100g, carbs_100g, fat_100g",
      )
      .order("created_at", { ascending: false }),
    hasApiKey(),
  ]);

  const items = (data as PantryItem[]) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back"
          className="text-[var(--muted)] transition active:scale-90"
        >
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-3xl font-semibold">Pantry</h1>
      </div>

      <PantryList items={items} />
      <PantryForm />
      <ListImport />
      <GroceryScan connected={connected} />
    </main>
  );
}
