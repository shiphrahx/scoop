"use client";

import { useRef, useState } from "react";
import { ListPlus, FileUp } from "lucide-react";
import type { ImportedItem } from "@/lib/types";
import { parseShoppingList } from "@/lib/shoppinglist";
import MatchItems from "./MatchItems";

// Import a shopping list by pasting it or picking a .csv/.txt file. Parses to
// items, then hands them to the shared matcher (#6) to resolve macros. Keyless.
export default function ListImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [items, setItems] = useState<ImportedItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function parse(input: string) {
    const found = parseShoppingList(input);
    if (found.length === 0) {
      setNote("Nothing to search — type an item or paste a list.");
      setItems(null);
      return;
    }
    setNote(null);
    setItems(found);
  }

  async function onFile(file: File) {
    const content = await file.text();
    setText(content);
    parse(content);
  }

  if (items) {
    return (
      <MatchItems
        items={items}
        onSaved={() => {
          setItems(null);
          setText("");
          setNote("Added to pantry.");
        }}
        onCancel={() => setItems(null)}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3 sc-card p-5">
      <h2 className="text-lg font-semibold">Search by name</h2>
      <p className="text-sm text-[var(--muted)]">
        Type one item, or paste a whole list — one per line (from Bring, AnyList,
        Google Keep, or a CSV).
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"2 milk\nbananas\n500 g rice"}
        rows={4}
        className="sc-input resize-none"
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {note && (
        <p className="text-center text-sm font-medium text-[var(--muted)]">{note}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="sc-btn sc-btn-neutral flex-1"
        >
          <FileUp size={18} /> Import file
        </button>
        <button
          onClick={() => parse(text)}
          disabled={!text.trim()}
          className="sc-btn sc-btn-soft flex-1"
        >
          <ListPlus size={18} /> Search
        </button>
      </div>
    </section>
  );
}
