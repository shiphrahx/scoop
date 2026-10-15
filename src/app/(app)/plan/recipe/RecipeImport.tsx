"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import type { ParsedRecipe } from "@/lib/ai";
import { addRecipeToMeal, importRecipeUrl, saveRecipe } from "./actions";

// Import a recipe from a link, then see it scaled: per-serving macros and how
// many servings fit the calories you have left today. Only the link path is
// offered, the screenshot backup runs on the user's own Anthropic key, which
// isn't a finished path, so it stays hidden.
export default function RecipeImport({ slots }: { slots: string[] }) {
  const [url, setUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<ParsedRecipe | null>(null);
  const [servings, setServings] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // After adding to a meal: where it went, and the lines that need adding by hand.
  const [added, setAdded] = useState<{ slot: string; unmatched: string[] } | null>(null);

  const perServing = recipe
    ? {
        kcal: recipe.kcal / Math.max(1, recipe.servings),
        protein_g: recipe.protein_g / Math.max(1, recipe.servings),
        carbs_g: recipe.carbs_g / Math.max(1, recipe.servings),
        fat_g: recipe.fat_g / Math.max(1, recipe.servings),
      }
    : null;

  function onResult(r: ParsedRecipe, src: string | null) {
    setRecipe(r);
    setSourceUrl(src);
    // Default to a single portion; the user taps ± to log more.
    setServings(1);
    setNote(null);
    setAdded(null);
  }

  async function fromUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setNote("Reading the recipe…");
    try {
      const r = await importRecipeUrl(url.trim());
      if (r.ok) onResult(r.recipe, url.trim());
      else setNote(r.message);
    } catch {
      setNote("Import failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!recipe) return;
    setBusy(true);
    try {
      await saveRecipe(recipe, sourceUrl);
      setNote(`Saved "${recipe.name}".`);
    } finally {
      setBusy(false);
    }
  }

  // Into one of today's meals, as foods the user can adjust on the day plan.
  async function addTo(slot: string) {
    if (!recipe) return;
    setBusy(true);
    try {
      const r = await addRecipeToMeal(recipe, servings, slot);
      if (r.ok) {
        setRecipe(null);
        setUrl("");
        setNote(null);
        setAdded({ slot: r.slot, unmatched: r.unmatched });
      } else {
        setNote(r.message);
      }
    } catch {
      setNote("Couldn't add the recipe. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-semibold">Import a recipe</h2>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a recipe link"
          inputMode="url"
          className="sc-input min-w-0 flex-1"
        />
        <button
          onClick={fromUrl}
          disabled={busy || !url.trim()}
          className="sc-btn sc-btn-primary shrink-0"
        >
          Import
        </button>
      </div>

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">
          {note}
        </p>
      )}

      {added && (
        <div className="flex flex-col gap-2 rounded-2xl bg-[var(--tint-teal)] p-4 text-sm">
          <p className="font-semibold">Added to {added.slot}.</p>
          {added.unmatched.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[var(--muted)]">
                These didn&apos;t match a food, so add them to the meal yourself:
              </p>
              <ul className="list-inside list-disc">
                {added.unmatched.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <Link href="/plan/day" className="sc-btn sc-btn-primary mt-1">
            Open the day plan
          </Link>
        </div>
      )}

      {recipe && perServing && (
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--fill-soft)] p-4">
          <p className="text-lg font-semibold">{recipe.name}</p>
          <p className="text-xs text-[var(--muted)]">
            Makes {recipe.servings} · per serving{" "}
            {Math.round(perServing.kcal)} kcal · P
            {Math.round(perServing.protein_g)} C{Math.round(perServing.carbs_g)}{" "}
            F{Math.round(perServing.fat_g)}
          </p>

          {recipe.ingredients.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{ing.name}</span>
                  <span className="shrink-0 text-[var(--muted)]">
                    {ing.quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Servings to eat</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                aria-label="One fewer"
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
              >
                <Minus size={18} />
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">
                {servings}
              </span>
              <button
                onClick={() => setServings((s) => s + 1)}
                aria-label="One more"
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Add to today&apos;s</span>
            <div className="grid grid-cols-2 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => addTo(slot)}
                  disabled={busy}
                  className="sc-btn sc-btn-primary"
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={save}
            disabled={busy}
            className="sc-btn sc-btn-soft"
          >
            Save recipe
          </button>
        </div>
      )}
    </section>
  );
}
