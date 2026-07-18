"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { PantryItem } from "@/lib/types";
import { PANTRY_CATEGORIES } from "@/lib/foodgroups";
import {
  clearPantry,
  deletePantryItem,
  setPantryCategory,
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

// The shelf an item shows under. Null/blank items fall under "Other".
function shelfOf(item: PantryItem): string {
  return item.category?.trim() || "Other";
}

// Split the pantry into shelves, in a stable reading order: the known
// categories in their canonical order, then any the user invented (A→Z), then
// "Other" last as the catch-all.
function groupByCategory(items: PantryItem[]): [string, PantryItem[]][] {
  const groups = new Map<string, PantryItem[]>();
  for (const item of items) {
    const key = shelfOf(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const known = (PANTRY_CATEGORIES as readonly string[]).filter(
    (c) => c !== "Other" && groups.has(c),
  );
  const custom = [...groups.keys()]
    .filter((c) => !(PANTRY_CATEGORIES as readonly string[]).includes(c))
    .sort((a, b) => a.localeCompare(b));
  const order = [...known, ...custom];
  if (groups.has("Other")) order.push("Other");

  return order.map((c) => [c, groups.get(c)!]);
}

// The user's pantry, split by shelf. Tap +/− to change how many they have (zero
// removes it), pencil to edit name/macros/pack size/shelf, trash to delete.
export default function PantryList({ items }: { items: PantryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Pantry is empty. Scan a barcode or import a list to add something.
      </p>
    );
  }

  const groups = groupByCategory(items);
  // Every category the user already has, offered when re-filing an item so their
  // own shelves are one tap away alongside the built-in ones.
  const existing = groups.map(([name]) => name);

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([category, rows]) => (
        <section key={category} className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-2 px-1">
            <span className="text-lg font-semibold">{category}</span>
            <span className="text-sm text-[var(--muted)]">{rows.length}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {rows.map((item) => (
              <PantryRow key={item.id} item={item} categories={existing} />
            ))}
          </ul>
        </section>
      ))}
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

function PantryRow({
  item,
  categories,
}: {
  item: PantryItem;
  categories: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const step = (delta: number) =>
    startTransition(() => setPantryQuantity(item.id, item.quantity + delta));

  function remove() {
    if (!window.confirm(`Remove ${item.name} from your pantry?`)) return;
    startTransition(() => deletePantryItem(item.id));
  }

  if (editing) {
    return (
      <EditRow
        item={item}
        categories={categories}
        onDone={() => setEditing(false)}
      />
    );
  }

  const noMacros = item.kcal_100g === 0;

  return (
    <li className="sc-card flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
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
        <ShelfChip item={item} categories={categories} disabled={pending} />
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

// A pill on each row showing its shelf; changing it re-files the item in one
// tap. Only lists shelves that already exist — inventing a new one is done in
// the edit form, which is where the free-text box lives.
function ShelfChip({
  item,
  categories,
  disabled,
}: {
  item: PantryItem;
  categories: string[];
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const current = shelfOf(item);
  const options = [
    ...new Set<string>([
      ...(PANTRY_CATEGORIES as readonly string[]),
      ...categories,
      current,
    ]),
  ].filter(Boolean);

  return (
    <select
      value={current}
      disabled={disabled || pending}
      aria-label={`Shelf for ${item.name}`}
      onChange={(e) => {
        const next = e.target.value;
        if (next === current) return;
        startTransition(() => setPantryCategory(item.id, next));
      }}
      className="w-fit max-w-full self-start rounded-full bg-[var(--fill)] px-3 py-1 text-xs font-medium text-[var(--muted)] active:scale-95 disabled:opacity-50"
    >
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function EditRow({
  item,
  categories,
  onDone,
}: {
  item: PantryItem;
  categories: string[];
  onDone: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(shelfOf(item));
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
        category: category.trim() || null,
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

      <CategoryField
        value={category}
        onChange={setCategory}
        existing={categories}
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

// Pick which shelf an item sits on. The built-in shelves plus any the user has
// already made are offered as taps; "New shelf…" reveals a text box to name a
// fresh one. The current value is always shown even if it isn't in either list.
function CategoryField({
  value,
  onChange,
  existing,
}: {
  value: string;
  onChange: (v: string) => void;
  existing: string[];
}) {
  const [creating, setCreating] = useState(false);

  const options = [
    ...new Set<string>([
      ...(PANTRY_CATEGORIES as readonly string[]),
      ...existing,
      value,
    ]),
  ].filter(Boolean);

  if (creating) {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">New shelf</span>
        <div className="flex gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Shelf name"
            className="sc-input min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="sc-btn sc-btn-neutral shrink-0"
          >
            Done
          </button>
        </div>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--muted)]">Shelf</span>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            onChange("");
            setCreating(true);
          } else {
            onChange(e.target.value);
          }
        }}
        className="sc-input"
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="__new__">＋ New shelf…</option>
      </select>
    </label>
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
