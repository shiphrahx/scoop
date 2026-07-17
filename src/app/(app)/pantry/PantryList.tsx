"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { PantryItem } from "@/lib/types";
import {
  clearPantry,
  deletePantryItem,
  setPantryQuantity,
  updatePantryItem,
} from "./actions";

// "6 bagels per pack (71 g each)" for a countable item — how the pantry row
// shows a pack that's split into portions. Only called when both are known.
function packLabel(item: PantryItem): string {
  const n = Math.round((item.pack_size_g ?? 0) / (item.unit_g ?? 1));
  const label = item.unit_label ?? "portion";
  return `${n} ${n === 1 ? label : `${label}s`} per pack (${Math.round(item.unit_g ?? 0)} g each)`;
}

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
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <PantryRow key={item.id} item={item} />
        ))}
      </ul>
      <ClearAllButton count={items.length} />
    </div>
  );
}

function ClearAllButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();

  function clear() {
    if (
      !window.confirm(
        `Remove all ${count} item${count === 1 ? "" : "s"} from your pantry? This can't be undone.`,
      )
    ) {
      return;
    }
    startTransition(() => clearPantry());
  }

  return (
    <button
      onClick={clear}
      disabled={pending}
      className="sc-btn py-4 text-lg font-semibold text-white active:scale-95 disabled:opacity-50"
      style={{ background: "#e5484d" }}
    >
      <Trash2 size={20} />
      {pending ? "Clearing…" : "Clear pantry"}
    </button>
  );
}

function PantryRow({ item }: { item: PantryItem }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const step = (delta: number) =>
    startTransition(() => setPantryQuantity(item.id, item.quantity + delta));

  function remove() {
    if (!window.confirm(`Remove ${item.name} from your pantry?`)) return;
    startTransition(() => deletePantryItem(item.id));
  }

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
              {item.unit_g && item.pack_size_g
                ? ` · ${packLabel(item)}`
                : item.pack_size_g
                  ? ` · ${item.pack_size_g} g pack`
                  : ""}
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
          onClick={remove}
          disabled={pending}
          aria-label="Delete"
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--fill)] text-rose-600 active:scale-90 disabled:opacity-40"
        >
          <Trash2 size={16} />
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
  const [unitLabel, setUnitLabel] = useState(item.unit_label ?? "");
  // Stored as grams-per-portion; shown here as portions-per-pack (pack ÷ unit_g).
  const [portions, setPortions] = useState(
    item.unit_g && item.pack_size_g
      ? String(Math.round(item.pack_size_g / item.unit_g))
      : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const packG = pack.trim() === "" ? null : Number(pack) || null;
      const n = portions.trim() === "" ? null : Number(portions) || null;
      // One portion = pack weight ÷ portions per pack; needs both.
      const unit_g = packG && n && n > 0 ? Math.round(packG / n) : null;
      await updatePantryItem(item.id, {
        name,
        kcal_100g: Number(kcal) || 0,
        protein_100g: Number(protein) || 0,
        carbs_100g: Number(carbs) || 0,
        fat_100g: Number(fat) || 0,
        pack_size_g: packG,
        unit_g,
        unit_label: unit_g ? unitLabel.trim() || null : null,
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

      {/* Count instead of weigh: name the portion and say how many a pack makes
          (6 bagels, 2 portions). One portion = pack ÷ portions, so it can be
          logged by count. */}
      <p className="text-xs text-[var(--muted)]">
        Eaten in portions? Split a pack
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Portion name</span>
          <input
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            placeholder="bagel"
            className="sc-input"
          />
        </label>
        <NumField label="Portions per pack" value={portions} onChange={setPortions} />
      </div>
      {pack.trim() !== "" && Number(portions) > 0 && (
        <p className="text-xs text-[var(--muted)]">
          One {unitLabel.trim() || "portion"} ≈{" "}
          {Math.round(Number(pack) / Number(portions))} g
        </p>
      )}

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
