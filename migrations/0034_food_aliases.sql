-- Scoop: British words for American foods.
--
-- The food reference (0033) is USDA FNDDS, so it names things the American way.
-- A user here types "crisps" and means what that file calls "Potato chips"; they
-- type "chips" and mean "French fries", which is the dangerous one — searching
-- the word literally finds crisps, a real result that is the wrong food. So the
-- swap has to happen on the way IN, before the search, not as a fallback after
-- it fails.
--
-- Kept as data rather than code because it is a list, it will grow as we notice
-- gaps, and a signed-in user can add to it (created_by = them) exactly as they
-- can contribute a portion size. Seed rows have created_by null and are
-- read-only under RLS.
--
-- `alias` is what gets typed, `term` is what the reference calls it. Both are
-- matched lower case, and a multi-word alias is replaced as a phrase, longest
-- first, so "spring onion" wins over "onion". Run after 0033.

create table if not exists public.food_aliases (
  alias      text not null,
  term       text not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One meaning per alias, case-insensitively.
create unique index if not exists food_aliases_alias_lower
  on public.food_aliases (lower(alias));

alter table public.food_aliases enable row level security;

create policy "read food_aliases" on public.food_aliases
  for select using (true);
create policy "add food_aliases" on public.food_aliases
  for insert with check (auth.uid() = created_by);
create policy "edit own food_aliases" on public.food_aliases
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "delete own food_aliases" on public.food_aliases
  for delete using (auth.uid() = created_by);

-- Only unambiguous swaps. A word that means different foods on the two sides of
-- the Atlantic and could plausibly mean either here (jam/jelly, pudding,
-- lemonade) is deliberately absent: guessing wrong hands the user a different
-- food's macros without telling them, which is worse than no match.
--
-- Foods with no American equivalent at all — flapjack, digestive, Jaffa cake —
-- are not aliases either. Pointing "flapjack" at "granola bar" would look like
-- it worked and quietly book the wrong numbers. Those are seeded by hand (0032).
insert into public.food_aliases (alias, term, created_by)
select a.alias, a.term, null
from (values
  -- Same food, different word.
  ('crisps',          'potato chips'),
  ('chips',           'french fries'),
  ('courgette',       'zucchini'),
  ('aubergine',       'eggplant'),
  ('coriander',       'cilantro'),
  ('rocket',          'arugula'),
  ('prawn',           'shrimp'),
  ('prawns',          'shrimp'),
  ('mince',           'ground beef'),
  ('beetroot',        'beets'),
  ('swede',           'rutabaga'),
  ('mangetout',       'snow peas'),
  ('pak choi',        'bok choy'),
  ('spring onion',    'scallion'),
  ('spring onions',   'scallions'),
  ('sweetcorn',       'corn'),
  ('runner beans',    'green beans'),
  ('broad beans',     'fava beans'),
  ('spring greens',   'collard greens'),
  ('gammon',          'ham'),
  ('rasher',          'bacon'),
  ('chipolata',       'sausage'),
  ('jacket potato',   'baked potato'),
  ('porridge',        'oatmeal'),
  ('biscuit',         'cookie'),
  ('sweets',          'candy'),
  ('ice lolly',       'popsicle'),
  ('candyfloss',      'cotton candy'),
  ('fizzy drink',     'soda'),
  ('takeaway',        'takeout'),
  ('starter',         'appetizer'),
  -- Same food, different spelling.
  ('yoghurt',         'yogurt'),
  ('wholemeal',       'whole wheat'),
  ('chilli',          'chili'),
  ('tinned',          'canned'),
  -- Store-cupboard names.
  ('cornflour',       'cornstarch'),
  ('plain flour',     'all purpose flour'),
  ('icing sugar',     'powdered sugar'),
  ('tomato puree',    'tomato paste'),
  ('rapeseed oil',    'canola oil'),
  ('double cream',    'heavy cream'),
  ('single cream',    'light cream'),
  ('soured cream',    'sour cream'),
  ('natural yoghurt', 'plain yogurt')
) as a(alias, term)
where not exists (
  select 1 from public.food_aliases x where lower(x.alias) = lower(a.alias)
);
