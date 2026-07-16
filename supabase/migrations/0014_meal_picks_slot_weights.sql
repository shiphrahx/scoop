-- Per-meal planning. The day wizard used to build every meal from the same
-- three foods; now the user picks the ingredients they fancy for EACH meal and
-- one "build my day" portions all of them together to hit the day's macros.

-- ---------------------------------------------------------------------------
-- planned_meals.picks: the foods the user chose for this slot, per-100g macros
-- included, saved before the day is built. A row with picks but no portions is
-- a meal waiting for "Build my day"; the picks stay after the build so a
-- rebalance can re-portion the same foods.
-- ---------------------------------------------------------------------------
alter table public.planned_meals
  add column if not exists picks jsonb not null default '[]';

-- ---------------------------------------------------------------------------
-- users.slot_weights: how big each meal should be relative to the others, as a
-- map of slot name -> relative weight (e.g. {"Breakfast": 20, "Dinner": 40}).
-- Empty means every meal gets an even share. Slots missing from a non-empty
-- map fall back to the mean of the listed weights.
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists slot_weights jsonb not null default '{}';
