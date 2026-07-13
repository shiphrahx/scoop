"use client";

import { useRef, useState } from "react";
import { Camera, Minus, Plus } from "lucide-react";
import type { ParsedRecipe } from "@/lib/ai";
import { readImageForUpload } from "@/lib/image";
import {
  importRecipeImage,
  importRecipeUrl,
  logRecipeServings,
  saveRecipe,
} from "./actions";

// Import a recipe from a link or a screenshot, then see it scaled: per-serving
// macros and how many servings fit the calories you have left today. The link
// path is keyless (reads the page's structured data); only the screenshot
// backup needs the user's own key.
export default function RecipeImport({
  connected,
}: {
  connected: boolean;
}) {
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
    // Default to a single portion; the user taps ± to log more.
    setServings(1);
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
      const { base64, mediaType } = await readImageForUpload(file);
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
      setNote("Logged to today.");
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
        disabled={busy || !connected}
        className="sc-btn sc-btn-soft"
      >
        <Camera size={20} /> Screenshot instead
      </button>

      {!connected && (
        <p className="text-center text-xs text-[var(--muted)]">
          Paste a link works without a key. Connect your key in Settings for
          screenshot import.
        </p>
      )}

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">
          {note}
        </p>
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

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="sc-btn sc-btn-soft flex-1"
            >
              Save recipe
            </button>
            <button
              onClick={log}
              disabled={busy}
              className="sc-btn sc-btn-primary flex-1"
            >
              Log {servings}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
