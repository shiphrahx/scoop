-- Scoop: pack size on pantry items. Imported items (PDF / list / screenshot)
-- match against Open Food Facts, which reports a pack "quantity" like "500 g".
-- We keep macros per 100 g (as before) and store the pack size in grams so
-- portioning and logging can reason about a whole pack. Null when unknown or
-- for hand-entered items. Run after 0005.

alter table public.pantry_items
  add column if not exists pack_size_g numeric;
