"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { PantryItem } from "@/lib/types";
import { deletePantryItem, setPantryQuantity, updatePantryItem } from "./actions";

// The user's pantry. Tap +/− to change how many they have (zero removes it),
// pencil to edit name/macros/pack size, trash to delete.
export default function PantryList({ items }: { items: PantryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Pantry is empty. Scan a barcode or import a list to add something.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <PantryRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function PantryRow({ item }: { item: PantryItem }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const step = (delta: number) =>
    startTransition(() => setPantryQuantity(item.id, item.quantity + delta));

  if (editing) {
    return <EditRow item={item} onDone={() => setEditing(false)} />;
  }

  const noMacros = item.kcal_100g === 0;

  return (
    <li className="sc-card flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{item.name}</p>
        <p className="text-xs text-[var(--muted)]">
          {noMacros ? (
            <button
              onClick={() => setEditing(true)}
              className="font-medium text-[var(--ink-teal)]"
            >
              Add macros
            </button>
          ) : (
            <>
              {Math.round(item.kcal_100g)} kcal / 100g
              {item.pack_size_g ? ` · ${item.pack_size_g} g pack` : ""}
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit"
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] active:scale-90"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => step(-1)}
          disabled={pending}
          aria-label="One fewer"
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] active:scale-90 disabled:opacity-40"
        >
          <Minus size={18} />
        </button>
        <span className="w-6 text-center font-semibold tabular-nums">
          {item.quantity}
        </span>
        <button
          onClick={() => step(1)}
          disabled={pending}
          aria-label="One more"
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] active:scale-90 disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>
    </li>
  );
}

function EditRow({ item, onDone }: { item: PantryItem; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [kcal, setKcal] = useState(String(item.kcal_100g));
  const [protein, setProtein] = useState(String(item.protein_100g));
  const [carbs, setCarbs] = useState(String(item.carbs_100g));
  const [fat, setFat] = useState(String(item.fat_100g));
  const [pack, setPack] = useState(item.pack_size_g == null ? "" : String(item.pack_size_g));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updatePantryItem(item.id, {
        name,
        kcal_100g: Number(kcal) || 0,
        protein_100g: Number(protein) || 0,
        carbs_100g: Number(carbs) || 0,
        fat_100g: Number(fat) || 0,
        pack_size_g: pack.trim() === "" ? null : Number(pack) || null,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="sc-card flex flex-col gap-3 p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Item name"
        className="sc-input"
      />
      <p className="text-xs text-[var(--muted)]">Per 100g</p>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Calories" value={kcal} onChange={setKcal} />
        <NumField label="Protein" value={protein} onChange={setProtein} />
        <NumField label="Carbs" value={carbs} onChange={setCarbs} />
        <NumField label="Fat" value={fat} onChange={setFat} />
      </div>
      <NumField label="Pack size (g, optional)" value={pack} onChange={setPack} />

      <div className="flex gap-2">
        <button
          onClick={() => {
            void deletePantryItem(item.id);
          }}
          className="sc-btn border border-rose-300 font-semibold text-rose-600"
        >
          <Trash2 size={16} /> Delete
        </button>
        <button onClick={onDone} className="sc-btn sc-btn-neutral flex-1">
          <X size={16} /> Cancel
        </button>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="sc-btn sc-btn-primary flex-1"
        >
          <Check size={16} /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </li>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="sc-input"
      />
    </label>
  );
}
