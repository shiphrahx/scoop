-- Scoop: every macro in the app is for the food AS EATEN — cooked, never raw or
-- dry. Dry staples (rice, pasta, couscous, quinoa, oats) are the trap: a bag's
-- label is dry weight, and 60 g dry rice becomes ~180 g cooked with completely
-- different per-100g numbers. So the reference owns the truth for these: cooked
-- per-100g macros and cooked serving sizes, and the app steers a dry-staple scan
-- onto the matching cooked entry rather than trusting the bag.
--
-- A `cooked` flag marks a reference food whose macros are the cooked values, so
-- the UI can show it and the scan path can find the cooked substitute. Run after
-- 0019.

alter table public.fresh_foods
  add column if not exists cooked boolean not null default false;

-- Cooked grains, per-100g macros for the food already cooked (USDA cooked,
-- unsalted). Names carry "(cooked)" so it's unmistakable in every screen the
-- name shows in. Guarded by the lower(name) unique index — re-running is a no-op.
insert into public.fresh_foods
  (name, kcal_100g, protein_100g, carbs_100g, fat_100g,
   fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, cooked, created_by)
select t.name, t.kcal, t.protein, t.carbs, t.fat,
       t.fiber, t.sugar, t.satfat, t.sodium, true, null
from (values
  -- name,                kcal, protein, carbs, fat, fiber, sugar, satfat, sodium(mg)
  ('White Rice (cooked)',  130,  2.7, 28.2, 0.3, 0.4, 0.1, 0.1,  1),
  ('Brown Rice (cooked)',  123,  2.7, 25.6, 1.0, 1.6, 0.2, 0.2,  4),
  ('Pasta (cooked)',       158,  5.8, 30.9, 0.9, 1.8, 0.6, 0.2,  1),
  ('Couscous (cooked)',    112,  3.8, 23.2, 0.2, 1.4, 0.1, 0.0,  5),
  ('Quinoa (cooked)',      120,  4.4, 21.3, 1.9, 2.8, 0.9, 0.2,  7),
  ('Porridge (cooked)',     71,  2.5, 12.0, 1.5, 1.7, 0.3, 0.3,  4)
) as t(name, kcal, protein, carbs, fat, fiber, sugar, satfat, sodium)
on conflict (lower(name)) do nothing;

-- Cooked serving sizes, small/medium/large in COOKED grams (what lands on the
-- plate). Each guarded so re-running doesn't duplicate.
insert into public.fresh_food_sizes (food_id, label, grams, created_by)
select f.id, s.label, s.grams, null
from public.fresh_foods f
join (values
  ('White Rice (cooked)', 'small', 150), ('White Rice (cooked)', 'medium', 200), ('White Rice (cooked)', 'large', 250),
  ('Brown Rice (cooked)', 'small', 150), ('Brown Rice (cooked)', 'medium', 200), ('Brown Rice (cooked)', 'large', 250),
  ('Pasta (cooked)',      'small', 180), ('Pasta (cooked)',      'medium', 240), ('Pasta (cooked)',      'large', 300),
  ('Couscous (cooked)',   'small', 150), ('Couscous (cooked)',   'medium', 200), ('Couscous (cooked)',   'large', 250),
  ('Quinoa (cooked)',     'small', 140), ('Quinoa (cooked)',     'medium', 185), ('Quinoa (cooked)',     'large', 230),
  ('Porridge (cooked)',   'small', 200), ('Porridge (cooked)',   'medium', 300), ('Porridge (cooked)',   'large', 400)
) as s(name, label, grams) on lower(f.name) = lower(s.name)
where not exists (
  select 1 from public.fresh_food_sizes x
  where x.food_id = f.id and lower(x.label) = lower(s.label)
);
