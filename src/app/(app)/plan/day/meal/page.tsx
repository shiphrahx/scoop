import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import MealPicker from "./MealPicker";
import { getPlanForDate, getProfile, getTimezone, localToday } from "@/lib/queries";
import { macroRole } from "@/lib/foodgroups";
import { isFoodAllowed } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MEAL_SLOTS, type MealPick } from "@/lib/types";

// "Plan this meal": choose the foods you fancy for ONE meal — from the pantry,
// by search, or by scanning — and save them. No grams here: "Build my day" on
// the plan screen portions every picked meal together to hit the day's macros.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function PlanMealPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string; date?: string }>;
}) {
  const [{ slot: slotParam, date: dateParam }] = await Promise.all([
    searchParams,
    getTimezone(),
  ]);
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : undefined;
  const backHref = date ? `/plan/day?date=${date}` : "/plan/day";

  const supabase = await createClient();
  const [profile, { data: pantryRows }] = await Promise.all([
    getProfile(),
    supabase
      .from("pantry_items")
      .select(
        "name, off_barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, pack_size_g, unit_g, unit_label",
      )
      .order("name"),
  ]);

  // The slot must be one of the user's meals; a mangled link goes back.
  const slotNames = profile?.meal_slots?.length ? profile.meal_slots : DEFAULT_MEAL_SLOTS;
  const slot = slotParam && slotNames.includes(slotParam) ? slotParam : null;
  if (!slot) redirect(backHref);

  // The picks already saved for this slot, so the page opens mid-thought.
  const plan = await getPlanForDate(date ?? (await localToday()));
  const existing = plan.find((m) => m.slot === slot);
  const initial = existing && !existing.logged_food_id ? existing.picks : [];

  const diet = profile?.diet_type ?? "regular";
  const allergies = profile?.allergies ?? [];
  const dislikes = profile?.dislikes ?? [];

  // Every pantry item the user can actually eat, as a ready-made pick.
  const foods: MealPick[] = (
    (pantryRows as Array<{
      name: string;
      off_barcode: string | null;
      kcal_100g: number;
      protein_100g: number;
      carbs_100g: number;
      fat_100g: number;
      fiber_100g: number | null;
      sugar_100g: number | null;
      satfat_100g: number | null;
      sodium_mg_100g: number | null;
      pack_size_g: number | null;
      unit_g: number | null;
      unit_label: string | null;
    }>) ?? []
  )
    .filter((p) => isFoodAllowed(p.name, diet, allergies, dislikes))
    .map((p) => ({
      name: p.name,
      source: "pantry" as const,
      off_barcode: p.off_barcode,
      kcal_100g: Number(p.kcal_100g),
      protein_100g: Number(p.protein_100g),
      carbs_100g: Number(p.carbs_100g),
      fat_100g: Number(p.fat_100g),
      fiber_100g: Number(p.fiber_100g ?? 0),
      sugar_100g: Number(p.sugar_100g ?? 0),
      satfat_100g: Number(p.satfat_100g ?? 0),
      sodium_mg_100g: Number(p.sodium_mg_100g ?? 0),
      pack_size_g: p.pack_size_g != null ? Number(p.pack_size_g) : null,
      unit_g: p.unit_g != null ? Number(p.unit_g) : null,
      unit_label: p.unit_label,
    }));

  // Grouped the way people think about a plate. "Other" catches sauces, veg and
  // anything too light to anchor a macro.
  const groups = {
    protein: foods.filter((f) => macroRole(f) === "protein"),
    carb: foods.filter((f) => macroRole(f) === "carb"),
    fat: foods.filter((f) => macroRole(f) === "fat"),
    other: foods.filter((f) => macroRole(f) === null),
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 pt-8 pb-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"
        >
          <ChevronLeft size={16} /> Plan my day
        </Link>
        <h1 className="text-3xl font-semibold">Plan {slot.toLowerCase()}</h1>
        <p className="text-sm text-[var(--muted)]">
          Tap the foods you fancy for this meal — we&apos;ll work out how much of
          each when you build your day.
        </p>
      </div>

      <MealPicker slot={slot} date={date} groups={groups} initial={initial} />
    </main>
  );
}
