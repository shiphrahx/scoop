import DayPlan from "./DayPlan";
import BuildDayCard from "./BuildDayCard";
import HighDayToggle from "./HighDayToggle";
import AlcoholLogger from "./AlcoholLogger";
import { createClient } from "@/lib/supabase/server";
import {
  getProfile,
  getConsumedForDate,
  getHighDayStatus,
  getPlanForDate,
} from "@/lib/queries";
import { DEFAULT_MEAL_SLOTS, type FavouriteMeal } from "@/lib/types";
import { normalizePrefs } from "@/lib/nutrients";

// The day's actual plan — high-day toggle, build button, drink logger and the
// meal list. Fetched here so the page's header and day navigation paint
// immediately and this streams in behind a Suspense boundary; getHighDayStatus
// (targets + latest weight + high days) plus the plan and the day's food are the
// heavy reads on the screen.
export default async function DayBody({
  date,
  today,
}: {
  date: string;
  today: string;
}) {
  const supabase = await createClient();
  const [profile, highDay, plan, consumed, { data: favData }] = await Promise.all([
    getProfile(),
    getHighDayStatus(date),
    getPlanForDate(date),
    getConsumedForDate(date),
    supabase
      .from("favourite_meals")
      .select("id, name, items, kcal, protein_g, carbs_g, fat_g")
      .order("created_at", { ascending: false }),
  ]);
  const favourites = (favData as FavouriteMeal[]) ?? [];
  // The ring and the plan compare against THIS day's target — the high or low
  // day when cycling is on, the flat base when it's off.
  const target = highDay.target;
  // Macros left today, so the drink logger can default its carbs-vs-fat booking
  // to whichever the user has more room in.
  const carbsLeft = target ? target.carbs_g - consumed.carbs_g : null;
  const fatLeft = target ? target.fat_g - consumed.fat_g : null;

  const prefs = normalizePrefs(profile?.nutrient_prefs);
  const slotNames =
    profile?.meal_slots?.length ? profile.meal_slots : DEFAULT_MEAL_SLOTS;
  const bySlot = new Map(plan.map((m) => [m.slot, m]));
  const slots = slotNames.map((slot) => ({
    slot,
    meal: bySlot.get(slot) ?? null,
  }));

  // Meals with picks waiting (or already solved): they decide whether the big
  // button reads "Build my day" or "Rebalance my day" — and whether it shows.
  const pickedMeals = plan.filter((m) => m.picks.length > 0 && !m.logged_food_id);
  const anyUnbuilt = pickedMeals.some((m) => m.portions.length === 0);

  return (
    <>
      {highDay.enabled && (
        <HighDayToggle
          date={date === today ? undefined : date}
          isHigh={highDay.isHigh}
          remaining={highDay.remaining}
          allowance={highDay.allowance}
          surplusCarbsG={highDay.surplusCarbsG}
        />
      )}

      {pickedMeals.length > 0 && (
        <BuildDayCard
          date={date === today ? undefined : date}
          mode={anyUnbuilt ? "build" : "rebalance"}
        />
      )}

      <AlcoholLogger
        date={date === today ? undefined : date}
        carbsLeft={carbsLeft}
        fatLeft={fatLeft}
        lastAllocation={profile?.last_alcohol_allocation ?? null}
      />

      {/* Keyed on the day. ?date=A and ?date=B are one segment to the router,
          which keeps client state across them — so foods half-added to one day's
          empty slot would still be sitting there on the next day's screen. */}
      <DayPlan
        key={date}
        slots={slots}
        target={target}
        prefs={prefs}
        date={date}
        favourites={favourites}
      />
    </>
  );
}
