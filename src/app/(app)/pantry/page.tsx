import Link from "next/link";
import { ArrowLeft, Package, Plus } from "lucide-react";
import PantryList from "./PantryList";
import { createClient } from "@/lib/supabase/server";
import { pantryCategory } from "@/lib/foodgroups";
import type { PantryItem } from "@/lib/types";

// The pantry list. Adding items happens on /pantry/add.
export default async function PantryPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pantry_items")
    .select(
      "id, name, off_barcode, quantity, kcal_100g, protein_100g, carbs_100g, fat_100g, pack_size_g, unit_g, unit_label, unit_options, category",
    )
    .order("created_at", { ascending: false });

  // Shelve any legacy item that predates the category column (or was added
  // before it was set) so it lands on the right shelf without waiting on the
  // one-off backfill. Only for display — the DB row keeps its null until the
  // user moves it, at which point the choice is saved.
  const items = ((data as PantryItem[]) ?? []).map((item) =>
    item.category?.trim()
      ? item
      : {
          ...item,
          category: pantryCategory(item.name, {
            protein_100g: item.protein_100g,
            carbs_100g: item.carbs_100g,
            fat_100g: item.fat_100g,
          }),
        },
  );

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

      {items.length === 0 ? (
        <div className="sc-card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-full"
            style={{ background: "var(--tint-teal)", color: "var(--ink-teal)" }}
          >
            <Package size={30} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold">Your pantry is empty</p>
            <p className="text-sm text-[var(--muted)]">
              Add what you have so we can plan meals and log faster.
            </p>
          </div>
          <Link
            href="/pantry/add"
            className="sc-btn sc-btn-primary px-6 py-4 text-lg"
          >
            <Plus size={20} /> Add your first item
          </Link>
        </div>
      ) : (
        <>
          <Link
            href="/pantry/add"
            className="sc-btn sc-btn-primary py-4 text-lg"
          >
            <Plus size={20} /> Add item
          </Link>
          <PantryList items={items} />
        </>
      )}
    </main>
  );
}
