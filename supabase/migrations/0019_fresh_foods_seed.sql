-- Scoop: seed the fresh-food reference (0017) with common whole foods, their
-- per-100g macros, and typical small/medium/large weights. These are the picks
-- the "add to pantry" screen offers when the user types a fruit/veg name.
--
-- created_by is null on every seed row, which marks them read-only under RLS
-- (no user can edit or delete a seed food). Re-running is safe: the food upsert
-- is a no-op on the name index, and each size is guarded by "not exists".
--
-- Per-100g macros are edible-portion values (skin/pit/shell removed where they
-- aren't eaten); the sizes below are edible weights to match, so a size's macros
-- (per-100g × grams ÷ 100) come out right. Run after 0018.

-- Foods with their per-100g macros. Guarded by the lower(name) unique index so
-- re-running is a no-op.
insert into public.fresh_foods
  (name, kcal_100g, protein_100g, carbs_100g, fat_100g,
   fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, created_by)
select t.name, t.kcal, t.protein, t.carbs, t.fat,
       t.fiber, t.sugar, t.satfat, t.sodium, null
from (values
  -- name,        kcal, protein, carbs,  fat, fiber, sugar, satfat, sodium(mg)
  ('Banana',       89,  1.1, 22.8,  0.3, 2.6, 12.2, 0.1,   1),
  ('Apple',        52,  0.3, 13.8,  0.2, 2.4, 10.4, 0.0,   1),
  ('Orange',       47,  0.9, 11.8,  0.1, 2.4,  9.4, 0.0,   0),
  ('Pear',         57,  0.4, 15.2,  0.1, 3.1,  9.8, 0.0,   1),
  ('Peach',        39,  0.9,  9.5,  0.3, 1.5,  8.4, 0.0,   0),
  ('Plum',         46,  0.7, 11.4,  0.3, 1.4,  9.9, 0.0,   0),
  ('Kiwi',         61,  1.1, 14.7,  0.5, 3.0,  9.0, 0.0,   3),
  ('Lemon',        29,  1.1,  9.3,  0.3, 2.8,  2.5, 0.0,   2),
  ('Lime',         30,  0.7, 10.5,  0.2, 2.8,  1.7, 0.0,   2),
  ('Avocado',     160,  2.0,  8.5, 14.7, 6.7,  0.7, 2.1,   7),
  ('Strawberry',   32,  0.7,  7.7,  0.3, 2.0,  4.9, 0.0,   1),
  ('Tomato',       18,  0.9,  3.9,  0.2, 1.2,  2.6, 0.0,   5),
  ('Carrot',       41,  0.9,  9.6,  0.2, 2.8,  4.7, 0.0,  69),
  ('Potato',       77,  2.0, 17.5,  0.1, 2.1,  0.8, 0.0,   6),
  ('Sweet Potato', 86,  1.6, 20.1,  0.1, 3.0,  4.2, 0.0,  55),
  ('Onion',        40,  1.1,  9.3,  0.1, 1.7,  4.2, 0.0,   4),
  ('Bell Pepper',  31,  1.0,  6.0,  0.3, 2.1,  4.2, 0.0,   4),
  ('Cucumber',     15,  0.7,  3.6,  0.1, 0.5,  1.7, 0.0,   2),
  ('Mushroom',     22,  3.1,  3.3,  0.3, 1.0,  2.0, 0.0,   5),
  ('Egg',         143, 12.6,  0.7,  9.5, 0.0,  0.4, 3.1, 142)
) as t(name, kcal, protein, carbs, fat, fiber, sugar, satfat, sodium)
on conflict (lower(name)) do nothing;

-- Sizes for each food, small/medium/large, in edible grams. Each guarded so
-- re-running doesn't duplicate.
insert into public.fresh_food_sizes (food_id, label, grams, created_by)
select f.id, s.label, s.grams, null
from public.fresh_foods f
join (values
  ('Banana',       'small',  101), ('Banana',       'medium', 118), ('Banana',       'large', 136),
  ('Apple',        'small',  149), ('Apple',        'medium', 182), ('Apple',        'large', 223),
  ('Orange',       'small',   96), ('Orange',       'medium', 131), ('Orange',       'large', 184),
  ('Pear',         'small',  148), ('Pear',         'medium', 178), ('Pear',         'large', 230),
  ('Peach',        'small',  130), ('Peach',        'medium', 150), ('Peach',        'large', 175),
  ('Plum',         'small',   46), ('Plum',         'medium',  66), ('Plum',         'large',  85),
  ('Kiwi',         'small',   69), ('Kiwi',         'medium',  76), ('Kiwi',         'large',  91),
  ('Lemon',        'small',   58), ('Lemon',        'medium',  84), ('Lemon',        'large', 108),
  ('Lime',         'small',   44), ('Lime',         'medium',  67), ('Lime',         'large',  91),
  ('Avocado',      'small',  100), ('Avocado',      'medium', 150), ('Avocado',      'large', 200),
  ('Strawberry',   'small',    7), ('Strawberry',   'medium',  12), ('Strawberry',   'large',  18),
  ('Tomato',       'small',   91), ('Tomato',       'medium', 123), ('Tomato',       'large', 182),
  ('Carrot',       'small',   50), ('Carrot',       'medium',  61), ('Carrot',       'large',  72),
  ('Potato',       'small',  170), ('Potato',       'medium', 213), ('Potato',       'large', 369),
  ('Sweet Potato', 'small',   60), ('Sweet Potato', 'medium', 114), ('Sweet Potato', 'large', 180),
  ('Onion',        'small',   70), ('Onion',        'medium', 110), ('Onion',        'large', 150),
  ('Bell Pepper',  'small',   74), ('Bell Pepper',  'medium', 119), ('Bell Pepper',  'large', 164),
  ('Cucumber',     'small',  158), ('Cucumber',     'medium', 201), ('Cucumber',     'large', 280),
  ('Mushroom',     'small',   10), ('Mushroom',     'medium',  18), ('Mushroom',     'large',  30),
  ('Egg',          'small',   38), ('Egg',          'medium',  44), ('Egg',          'large',  50)
) as s(name, label, grams) on lower(f.name) = lower(s.name)
where not exists (
  select 1 from public.fresh_food_sizes x
  where x.food_id = f.id and lower(x.label) = lower(s.label)
);
