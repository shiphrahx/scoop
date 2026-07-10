# Scoop

**Tell me how much to eat. Stop making me do the math.**

Normal food trackers hand you a search box and a food scale and walk away. You
want rice with dinner, so now you're the one figuring out: how many grams of
rice fit what's left of my macros today? Weigh, type, adjust, guess. Every meal.
It's tedious, and it's the reason most people quit tracking.

Scoop flips it around. You don't tell the app what you ate — the app tells you
what to eat. It knows your body, your goal, your pantry, and what you've already
eaten today, then it hands you the portion: *"180g of rice with the chicken."*
You just eat it.

Phone-first, big tap targets, almost no typing. Built to feel like Duolingo, not
a spreadsheet.

## The problems it solves

- **"How much of this can I eat?"** — Scoop gives you the exact portion to hit
  the macros you have left, so you never do the arithmetic.
- **"Tracking is too much typing."** — Scan a barcode, tap a favourite, snap a
  photo. Manual entry is the last resort, not the default.
- **"I cooked a big batch — now what?"** — Log the batch once; Scoop tracks
  macros per gram and how much is left across the week.
- **"What can I even make with what I have?"** — It suggests real meals using
  only what's in your pantry and fits your diet.
- **"Am I actually making progress?"** — It watches weight, measurements, and
  activity together, so a flat scale with a shrinking waist reads as the win it
  is.

## What it does

- **Tells you the portion.** Picks the grams of each food to hit today's
  remaining calories and macros. This is the whole point.
- **Sets your targets for you.** From your height, weight, age, sex, and
  activity it computes your calorie and macro goals — no calculators.
- **Easy food input.** Barcode scan (Open Food Facts), saved favourites, saved
  meals, photo of a label, or a grocery screenshot the AI reads for you.
- **Batch cooking.** Log the packs you used and the total cooked weight; Scoop
  divides it into per-gram macros and tracks the remaining batch day to day.
- **Pantry.** Knows the food you actually have, filled by barcode and receipt
  scans.
- **Plan a meal.** Pick a carb, pick a protein from pictures — it suggests
  dishes built only from your pantry that fit your diet.
- **Import a recipe.** Paste a URL (or screenshot it); the AI reads the recipe
  and scales it to your macros.
- **One-tap logging.** Daily weight in a tap; weekly waist / arms / thighs / hips.
- **The Coach.** Each week it reviews weight, measurements, activity, and food,
  then adjusts your macros and explains the change in plain words.
- **Auto body data.** Pulls workouts and sleep from Fitbit; takes Apple Watch
  data via Health Auto Export — so activity feeds your targets on its own.

## How it works, roughly

- **Targets** come from Mifflin–St Jeor BMR + your activity = TDEE, minus a
  deficit for weight loss, split high-protein. Plain formulas, no guessing.
- **Weekly adjustments** compare trailing average weight week over week — losing
  at a healthy rate holds macros, stalling trims a little, dropping too fast adds
  a little. Never reacts to a single day.
- **AI** (your own API key) only does the reading-and-suggesting jobs: grocery
  screenshots, recipes, and pantry meal ideas.

## Built with

Next.js · Tailwind · Supabase (Postgres + Google sign-in) · Vercel · Anthropic
API (bring your own key) · Open Food Facts.

See [`CLAUDE.md`](./CLAUDE.md) for the full product plan and build phases.
