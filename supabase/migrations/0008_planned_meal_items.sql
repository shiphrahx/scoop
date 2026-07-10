-- Scoop: a planned meal can hold a LIST of foods, not just one line. Each item
-- is a food the user picked — matched first against their pantry, otherwise
-- found on Open Food Facts. We keep per-100g macros + grams per item so the
-- meal's totals are exact and editable. AI-suggested slots keep using
-- `portions`; user-built ("manual") slots use `items`. Run after 0007.

alter table public.planned_meals
  add column if not exists items jsonb not null default '[]';
