-- Scoop: multiple named sizes on a pantry item. 0015 gave a pantry item ONE
-- countable unit (unit_g + unit_label). A fresh food comes in several sizes at
-- once — a banana is small OR medium OR large — so we store the whole set here
-- and keep unit_g/unit_label as the size the user currently has selected (so
-- the plan and log code, which reads those two, keeps working unchanged).
--
--   unit_options  jsonb array of { "label": "medium", "grams": 118 }. Null/[]
--                 for a weighed or single-unit item (nothing to choose from).
--
-- Seeded from the fresh-food reference (0017) when the user adds a food by
-- name; the user can switch the selected size on the pantry row. Run after 0017.

alter table public.pantry_items
  add column if not exists unit_options jsonb;
