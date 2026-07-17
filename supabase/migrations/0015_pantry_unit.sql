-- Scoop: countable units on pantry items. Some foods make no sense weighed —
-- a bagel, an egg, a scoop of protein. Macros stay per 100 g (as everywhere);
-- these two columns let a food be COUNTED instead of weighed.
--
--   unit_g     grams in one unit (a bagel = 85 g), so the app converts a count
--              to grams before any macro maths. Null = weigh it in grams.
--   unit_label what one unit is called ("bagel", "scoop", "ml"). Null = weighed.
--
-- Open Food Facts seeds both from its serving data on scan/import; the user can
-- confirm or override. Run after 0014.

alter table public.pantry_items
  add column if not exists unit_g numeric;

alter table public.pantry_items
  add column if not exists unit_label text;
