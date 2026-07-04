"use client";

import { useRef, useState } from "react";
import type { ParsedRecipe } from "@/lib/ai";
import { readImageFile } from "@/lib/image";
import {
  importRecipeImage,
  importRecipeUrl,
  logRecipeServings,
  saveRecipe,
} from "./actions";

// Import a recipe from a link or a screenshot, then see it scaled: per-serving
// macros and how many servings fit the calories you have left today.
export default function RecipeImport({ remainingKcal }: { remainingKcal: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<ParsedRecipe | null>(null);
  const [servings, setServings] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
    const per = r.kcal / Math.max(1, r.servings);
    // Suggest the number of servings that fits the calories left today.
    const fit = per > 0 ? Math.floor(remainingKcal / per) : 1;
    setServings(Math.min(Math.max(1, fit), Math.max(1, Math.round(r.servings))));
    setNote(null);
  }

  async function fromUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setNote("Reading the recipe…");
    try {
      const r = await importRecipeUrl(url.trim());
      onResult(r, url.trim());
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function fromImage(file: File) {
    setBusy(true);
    setNote("Reading the recipe…");
    try {
      const { base64, mediaType } = await readImageFile(file);
      const r = await importRecipeImage(base64, mediaType);
      onResult(r, null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Import failed.");
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

  async function log() {
    if (!recipe) return;
    setBusy(true);
    try {
      await logRecipeServings(recipe, servings);
      setRecipe(null);
      setUrl("");
      setNote("Logged to today 🎉");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-black/10 p-5 dark:border-white/15">
      <h2 className="text-lg font-bold">Import a recipe</h2>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a recipe link"
          inputMode="url"
          className="min-w-0 flex-1 rounded-2xl border-2 border-black/10 px-4 py-3 outline-none focus:border-green-500 dark:border-white/15 dark:bg-transparent"
        />
        <button
          onClick={fromUrl}
          disabled={busy || !url.trim()}
          className="shrink-0 rounded-2xl bg-green-500 px-5 py-3 font-bold text-white active:scale-95 disabled:opacity-50"
        >
          Import
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) fromImage(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="rounded-2xl border-2 border-green-500 px-6 py-3 font-bold text-green-600 active:scale-95 disabled:opacity-50 dark:text-green-400"
      >
        📷 Screenshot instead
      </button>

      {note && (
        <p className="text-center text-sm font-medium text-black/60 dark:text-white/60">
          {note}
        </p>
      )}

      {recipe && perServing && (
        <div className="flex flex-col gap-3 rounded-2xl bg-black/5 p-4 dark:bg-white/10">
          <p className="text-lg font-bold">{recipe.name}</p>
          <p className="text-xs text-black/50 dark:text-white/50">
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
                  <span className="shrink-0 text-black/50 dark:text-white/50">
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
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-xl font-bold active:scale-90 dark:bg-white/15"
              >
                −
              </button>
              <span className="w-6 text-center font-bold tabular-nums">
                {servings}
              </span>
              <button
                onClick={() => setServings((s) => s + 1)}
                aria-label="One more"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-xl font-bold active:scale-90 dark:bg-white/15"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-2xl border-2 border-green-500 px-4 py-3 font-bold text-green-600 active:scale-95 disabled:opacity-50 dark:text-green-400"
            >
              Save recipe
            </button>
            <button
              onClick={log}
              disabled={busy}
              className="flex-1 rounded-2xl bg-green-500 px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-50"
            >
              Log {servings}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
