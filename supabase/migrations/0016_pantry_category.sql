-- Scoop: a shelf/category on each pantry item so the list can be split into
-- Protein / Carbs / Fat / Vegetables / Fruits / Drinks (and Dairy, Snacks,
-- Condiments, Other). New items are categorised in the app when added; the user
-- can move an item to another shelf or invent a new one, so this is free text,
-- not an enum. Null = not yet categorised (shown under "Other"). Run after 0015.

alter table public.pantry_items
  add column if not exists category text;

-- Backfill the items already on the shelf, mirroring the app's categoriser
-- (src/lib/foodgroups.ts pantryCategory): a drink/fruit/veg name wins first,
-- otherwise the dominant macro decides — protein once it carries a quarter of
-- the calories, else carbs vs fat, with too-light foods landing in "Other".
update public.pantry_items set category =
  case
    when name ~* '\y(water|juice|cola|coke|soda|lemonade|squash|cordial|coffee|tea|milk|smoothie|shake|beer|wine|cider|kombucha|drink|drinks|tonic|espresso|latte|cappuccino|cocoa)\y'
      then 'Drinks'
    when name ~* '\y(apple|apples|banana|bananas|orange|oranges|grape|grapes|berry|berries|strawberr\w*|blueberr\w*|raspberr\w*|blackberr\w*|mango|mangoes|pineapple|pear|pears|peach|peaches|plum|plums|melon|watermelon|kiwi|cherry|cherries|apricot|apricots|fig|figs|date|dates|raisin|raisins|lemon|lemons|lime|limes|clementine|satsuma|nectarine|pomegranate)\y'
      then 'Fruits'
    when name ~* '\y(broccoli|carrot|carrots|spinach|kale|lettuce|cucumber|tomato|tomatoes|pepper|peppers|onion|onions|garlic|courgette|courgettes|zucchini|aubergine|eggplant|cauliflower|cabbage|celery|mushroom|mushrooms|pea|peas|sweetcorn|beetroot|leek|leeks|asparagus|sprout|sprouts|salad|greens|rocket|radish|turnip|parsnip|pumpkin)\y'
      then 'Vegetables'
    when (protein_100g * 4) + (carbs_100g * 4) + (fat_100g * 9) < 40
      then 'Other'
    when (protein_100g * 4) >= 0.25 * ((protein_100g * 4) + (carbs_100g * 4) + (fat_100g * 9))
      then 'Protein'
    when (carbs_100g * 4) >= (fat_100g * 9)
      then 'Carbs'
    else 'Fat'
  end
where category is null;
