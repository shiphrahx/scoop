-- Scoop: seed the fresh-food reference (0017) with the everyday foods that have
-- NO barcode and whose macros nobody knows off the top of their head — a slice
-- of cake, a cookie, a croissant, a portion of chips. Open Food Facts is a
-- packaged-product database, so it answers "a piece of cake" with branded cake
-- bars or nothing at all; these rows are what the day planner offers instead.
--
-- Each food is named as the thing actually eaten ("Chocolate Cake Slice", not
-- "Chocolate Cake"), because a size label and the food name are joined into the
-- portion word the plan reads back ("2 medium chocolate cake slices"). Sizes are
-- edible weights of one portion, so a size's macros (per-100g × grams ÷ 100)
-- come out right.
--
-- Values are typical/average figures for the food as eaten, not any one brand's
-- product. created_by is null, which marks them read-only under RLS. Re-running
-- is safe: the food upsert is a no-op on the name index, and each size is
-- guarded by "not exists". Run after 0021.

insert into public.fresh_foods
  (name, kcal_100g, protein_100g, carbs_100g, fat_100g,
   fiber_100g, sugar_100g, satfat_100g, sodium_mg_100g, created_by)
select t.name, t.kcal, t.protein, t.carbs, t.fat,
       t.fiber, t.sugar, t.satfat, t.sodium, null
from (values
  -- name,                    kcal, protein, carbs,  fat, fiber, sugar, satfat, sodium(mg)
  -- Cakes and bakery, sold by the slice.
  ('Chocolate Cake Slice',     371,  4.5, 51.0, 17.0, 1.8, 36.0,  6.5, 320),
  ('Carrot Cake Slice',        415,  4.2, 50.0, 22.0, 1.5, 33.0,  4.5, 300),
  ('Sponge Cake Slice',        350,  5.0, 50.0, 15.0, 0.9, 32.0,  5.0, 280),
  ('Cheesecake Slice',         321,  5.5, 26.0, 21.0, 0.4, 22.0, 11.0, 310),
  ('Banana Bread Slice',       326,  4.3, 54.0, 10.5, 1.5, 28.0,  2.5, 300),
  -- Sold whole, one to a portion.
  ('Brownie',                  466,  6.0, 50.0, 28.0, 2.5, 38.0, 10.0, 280),
  ('Chocolate Chip Cookie',    488,  5.4, 64.0, 24.0, 2.4, 38.0, 12.0, 380),
  ('Digestive Biscuit',        471,  6.7, 62.0, 21.0, 3.0, 17.0, 10.0, 580),
  ('Blueberry Muffin',         377,  5.5, 51.0, 17.0, 1.5, 28.0,  3.5, 350),
  ('Croissant',                406,  8.2, 45.8, 21.0, 2.6, 11.0, 12.0, 470),
  ('Pain au Chocolat',         435,  7.5, 45.0, 25.0, 2.5, 16.0, 15.0, 400),
  ('Doughnut',                 421,  5.5, 50.0, 22.0, 1.5, 22.0, 10.0, 380),
  ('Scone',                    362,  7.2, 53.0, 13.0, 2.1,  8.0,  7.0, 650),
  ('Flapjack',                 452,  5.0, 60.0, 21.0, 3.5, 30.0, 11.0, 180),
  -- Confectionery and frozen.
  ('Milk Chocolate Bar',       535,  7.7, 59.0, 30.0, 3.4, 52.0, 18.0,  80),
  ('Dark Chocolate Bar',       546,  4.9, 61.0, 31.0, 7.0, 48.0, 19.0,  24),
  ('Ice Cream Scoop',          207,  3.5, 24.0, 11.0, 0.7, 21.0,  6.8,  80),
  -- Savoury things bought out or served at the table.
  ('Pizza Slice',              266, 11.0, 33.0, 10.0, 2.3,  3.6,  4.5, 600),
  ('Chips',                    312,  3.4, 41.0, 15.0, 3.8,  0.3,  2.3, 210),
  ('Garlic Bread Slice',       350,  8.5, 44.0, 15.0, 2.5,  3.0,  6.0, 620),
  ('Naan Bread',               310,  9.0, 50.0,  7.0, 2.2,  3.5,  1.5, 560),
  ('Sausage Roll',             320,  9.0, 25.0, 20.0, 1.5,  1.5,  9.0, 560),
  ('Samosa',                   308,  5.0, 32.0, 18.0, 2.5,  2.0,  6.0, 460),
  ('Spring Roll',              240,  5.0, 28.0, 12.0, 2.0,  3.0,  3.0, 430)
) as t(name, kcal, protein, carbs, fat, fiber, sugar, satfat, sodium)
on conflict (lower(name)) do nothing;

-- Portion weights. Every food carries a "medium", which is the size the app
-- defaults to (see defaultSize) — so one tap adds a realistic portion and the
-- small/large chips are there when it wasn't the right one.
insert into public.fresh_food_sizes (food_id, label, grams, created_by)
select f.id, s.label, s.grams, null
from public.fresh_foods f
join (values
  ('Chocolate Cake Slice',  'small',  60), ('Chocolate Cake Slice',  'medium',  95), ('Chocolate Cake Slice',  'large', 130),
  ('Carrot Cake Slice',     'small',  60), ('Carrot Cake Slice',     'medium',  95), ('Carrot Cake Slice',     'large', 130),
  ('Sponge Cake Slice',     'small',  50), ('Sponge Cake Slice',     'medium',  75), ('Sponge Cake Slice',     'large', 100),
  ('Cheesecake Slice',      'small',  80), ('Cheesecake Slice',      'medium', 110), ('Cheesecake Slice',      'large', 145),
  ('Banana Bread Slice',    'small',  45), ('Banana Bread Slice',    'medium',  60), ('Banana Bread Slice',    'large',  80),
  ('Brownie',               'small',  35), ('Brownie',               'medium',  45), ('Brownie',               'large',  75),
  ('Chocolate Chip Cookie', 'small',  12), ('Chocolate Chip Cookie', 'medium',  16), ('Chocolate Chip Cookie', 'large',  40),
  ('Digestive Biscuit',                                             'medium',  15),
  ('Blueberry Muffin',      'small',  40), ('Blueberry Muffin',      'medium', 110), ('Blueberry Muffin',      'large', 140),
  ('Croissant',             'small',  45), ('Croissant',             'medium',  60), ('Croissant',             'large',  85),
  ('Pain au Chocolat',                                              'medium',  65), ('Pain au Chocolat',      'large',  85),
  ('Doughnut',                                                      'medium',  60), ('Doughnut',              'large',  80),
  ('Scone',                                                         'medium',  70), ('Scone',                 'large',  90),
  ('Flapjack',              'small',  40), ('Flapjack',              'medium',  60), ('Flapjack',              'large',  90),
  ('Milk Chocolate Bar',    'small',  25), ('Milk Chocolate Bar',    'medium',  45), ('Milk Chocolate Bar',    'large', 100),
  ('Dark Chocolate Bar',    'small',  25), ('Dark Chocolate Bar',    'medium',  40), ('Dark Chocolate Bar',    'large', 100),
  ('Ice Cream Scoop',       'small',  45), ('Ice Cream Scoop',       'medium',  60), ('Ice Cream Scoop',       'large',  90),
  ('Pizza Slice',           'small',  80), ('Pizza Slice',           'medium', 105), ('Pizza Slice',           'large', 145),
  ('Chips',                 'small', 100), ('Chips',                 'medium', 165), ('Chips',                 'large', 250),
  ('Garlic Bread Slice',                                            'medium',  40),
  ('Naan Bread',            'small',  45), ('Naan Bread',            'medium',  90), ('Naan Bread',            'large', 130),
  ('Sausage Roll',          'small',  60), ('Sausage Roll',          'medium',  90), ('Sausage Roll',          'large', 130),
  ('Samosa',                                                        'medium',  60),
  ('Spring Roll',                                                   'medium',  45)
) as s(name, label, grams) on lower(f.name) = lower(s.name)
where not exists (
  select 1 from public.fresh_food_sizes x
  where x.food_id = f.id and lower(x.label) = lower(s.label)
);
