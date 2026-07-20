-- Scoop: extend the fresh-food reference (0017) with the common vegetables the
-- first seed (0019) left out — broccoli, courgette, spinach and the rest — so a
-- user can add any of them to their pantry by name and get sensible per-100g
-- macros and typical sizes. The day planner treats these as meal fillers, sized
-- by energy (see mealplan.ts), so seeding them makes "plan my day" work for the
-- veg people actually pick.
--
-- Same rules as 0019: created_by is null (read-only under RLS), the food upsert
-- is a no-op on the name index, and each size is guarded by "not exists", so
-- re-running is safe. Per-100g macros are edible-portion values and the sizes
-- are edible weights to match. Run after 0019.

insert into public.fresh_foods
  (name, kcal_100g, protein_100g, carbs_100g, fat_100g,
   fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, created_by)
select t.name, t.kcal, t.protein, t.carbs, t.fat,
       t.fiber, t.sugar, t.satfat, t.sodium, null
from (values
  -- name,             kcal, protein, carbs,  fat, fiber, sugar, satfat, sodium(mg)
  ('Broccoli',           34,  2.8,  6.6,  0.4, 2.6,  1.7, 0.1,  33),
  ('Cauliflower',        25,  1.9,  5.0,  0.3, 2.0,  1.9, 0.1,  30),
  ('Courgette',          17,  1.2,  3.1,  0.3, 1.0,  2.5, 0.1,   8),
  ('Aubergine',          25,  1.0,  5.9,  0.2, 3.0,  3.5, 0.0,   2),
  ('Celery',             16,  0.7,  3.0,  0.2, 1.6,  1.3, 0.0,  80),
  ('Leek',               61,  1.5, 14.2,  0.3, 1.8,  3.9, 0.0,  20),
  ('Spinach',            23,  2.9,  3.6,  0.4, 2.2,  0.4, 0.1,  79),
  ('Kale',               35,  2.9,  4.4,  1.5, 4.1,  0.8, 0.2,  53),
  ('Cabbage',            25,  1.3,  5.8,  0.1, 2.5,  3.2, 0.0,  18),
  ('Lettuce',            15,  1.4,  2.9,  0.2, 1.3,  0.8, 0.0,  28),
  ('Peas',               81,  5.4, 14.5,  0.4, 5.7,  5.9, 0.1,   5),
  ('Sweetcorn',          86,  3.3, 19.0,  1.4, 2.7,  3.2, 0.2,  15),
  ('Asparagus',          20,  2.2,  3.9,  0.1, 2.1,  1.9, 0.0,   2),
  ('Beetroot',           43,  1.6,  9.6,  0.2, 2.8,  6.8, 0.0,  78),
  ('Parsnip',            75,  1.2, 18.0,  0.3, 4.9,  4.8, 0.1,  10),
  ('Turnip',             28,  0.9,  6.4,  0.1, 1.8,  3.8, 0.0,  67),
  ('Butternut Squash',   45,  1.0, 11.7,  0.1, 2.0,  2.2, 0.0,   4),
  ('Brussels Sprout',    43,  3.4,  9.0,  0.3, 3.8,  2.2, 0.1,  25),
  ('Spring Onion',       32,  1.8,  7.3,  0.2, 2.6,  2.3, 0.0,  16),
  ('Radish',             16,  0.7,  3.4,  0.1, 1.6,  1.9, 0.0,  39)
) as t(name, kcal, protein, carbs, fat, fiber, sugar, satfat, sodium)
on conflict (lower(name)) do nothing;

-- Sizes, small/medium/large, in edible grams. Leafy/loose veg (spinach, kale,
-- peas) are a serving; whole-item veg (broccoli crown, courgette, aubergine) are
-- the item; per-piece veg (a sprout, a spring onion, a radish) are one piece.
insert into public.fresh_food_sizes (food_id, label, grams, created_by)
select f.id, s.label, s.grams, null
from public.fresh_foods f
join (values
  ('Broccoli',         'small', 200), ('Broccoli',         'medium', 350), ('Broccoli',         'large',  500),
  ('Cauliflower',      'small', 400), ('Cauliflower',      'medium', 600), ('Cauliflower',      'large',  850),
  ('Courgette',        'small', 150), ('Courgette',        'medium', 196), ('Courgette',        'large',  300),
  ('Aubergine',        'small', 250), ('Aubergine',        'medium', 400), ('Aubergine',        'large',  550),
  ('Celery',           'small',  40), ('Celery',           'medium',  64), ('Celery',           'large',   80),
  ('Leek',             'small',  90), ('Leek',             'medium', 130), ('Leek',             'large',  180),
  ('Spinach',          'small',  30), ('Spinach',          'medium',  60), ('Spinach',          'large',   90),
  ('Kale',             'small',  30), ('Kale',             'medium',  60), ('Kale',             'large',   90),
  ('Cabbage',          'small', 500), ('Cabbage',          'medium', 900), ('Cabbage',          'large', 1300),
  ('Lettuce',          'small', 200), ('Lettuce',          'medium', 300), ('Lettuce',          'large',  500),
  ('Peas',             'small',  60), ('Peas',             'medium',  80), ('Peas',             'large',  100),
  ('Sweetcorn',        'small',  90), ('Sweetcorn',        'medium', 154), ('Sweetcorn',        'large',  220),
  ('Asparagus',        'small',  12), ('Asparagus',        'medium',  16), ('Asparagus',        'large',   20),
  ('Beetroot',         'small',  60), ('Beetroot',         'medium',  82), ('Beetroot',         'large',  120),
  ('Parsnip',          'small', 100), ('Parsnip',          'medium', 130), ('Parsnip',          'large',  170),
  ('Turnip',           'small',  90), ('Turnip',           'medium', 122), ('Turnip',           'large',  180),
  ('Butternut Squash', 'small', 600), ('Butternut Squash', 'medium', 900), ('Butternut Squash', 'large', 1200),
  ('Brussels Sprout',  'small',  15), ('Brussels Sprout',  'medium',  19), ('Brussels Sprout',  'large',   25),
  ('Spring Onion',     'small',  10), ('Spring Onion',     'medium',  15), ('Spring Onion',     'large',   20),
  ('Radish',           'small',   5), ('Radish',           'medium',   9), ('Radish',           'large',   15)
) as s(name, label, grams) on lower(f.name) = lower(s.name)
where not exists (
  select 1 from public.fresh_food_sizes x
  where x.food_id = f.id and lower(x.label) = lower(s.label)
);
