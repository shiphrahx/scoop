# Scoop — Project Guide for Claude Code

This file tells you (Claude Code) what Scoop is and how to build it.
Read it fully before writing code. Keep it updated as the app grows.

---

## What Scoop is

A mobile-first weight-loss coach app. It flips normal food tracking around:
instead of the user searching foods, **the app tells them the portion to eat**
to hit their macros. It reads their body data automatically, learns their
pantry, and adjusts targets each week based on real results.

Users: the two owners first (one on Fitbit + Android, one on Apple Watch +
iPhone), then open to anyone via Google sign-in.

**Design feel:** like Duolingo. Big buttons, lots of tapping, almost no typing.
Mobile-first. Friendly and simple.

---

## Tech stack (all free tiers)

- **Framework:** Next.js (App Router, TypeScript)
- **UI:** Tailwind CSS — big rounded tap targets, mobile-first
- **PWA:** installable to home screen (manifest + service worker)
- **Auth + Database:** Supabase (Postgres + Google OAuth built in)
- **Hosting:** Vercel (supports server code + API routes)
- **AI:** Anthropic API, using each user's own API key (bring-your-own-key)
- **Food data:** Open Food Facts API (free, barcode + macros)
- **Barcode scanning:** `@zxing/browser` via the phone camera

Do not add paid services. If a feature needs one, stop and flag it.

---

## Working rules (important)

- **Commit after every change.** Every single change gets its own commit — even
  tiny ones. Do not batch work into one commit at the end. Small commits are
  fine and expected.
- **Never mention Claude, AI, or automated authorship** in commit messages, PR
  titles, or PR descriptions. Write them as a normal human developer would.
- Use short, plain commit messages describing the change (e.g. "add weight input
  field", "fix macro total rounding").
- Keep secrets out of commits (use `.env.local`).

---

## Core principle: less typing, more tapping

Every feature should be reachable in 1–2 taps. When you design a screen, ask:
"could this be a tap instead of typing?" Default to scanning, choosing from
pictures, and saved favourites over manual text entry.

---

## Data model (Supabase tables)

- `users` — id, email, diet_type (regular/vegetarian/vegan), allergies[],
  dislikes[], goal, height, sex, birth_year, anthropic_api_key (encrypted)
- `weights` — user_id, date, weight_kg
- `measurements` — user_id, date, waist, arms, thighs, hips
- `pantry_items` — user_id, name, off_barcode, quantity, macros
- `batches` — user_id, name, source_packs[], total_cooked_g, total_macros,
  remaining_g
- `food_logs` — user_id, datetime, source (batch/barcode/recipe/manual),
  grams, macros
- `favourites` — user_id, name, macros (the "my usual" items)
- `recipes` — user_id, name, source_url, ingredients[], base_macros
- `daily_targets` — user_id, week_start, kcal, protein, carbs, fat
- `activity` — user_id, date, steps, workout_kcal, sleep_hours (from Fitbit/Apple)

---

## Features (build these; details in the product plan)

1. **Google sign-in** (Supabase auth)
2. **Onboarding**: diet type, allergies, goal, height/weight/age/sex → sets macros
3. **Home**: calories + macros left today, quick actions
4. **Add food**: barcode scan, grocery screenshot (AI), photo of label, search,
   favourites, saved meals
5. **Batch cooking**: log packs used + total cooked weight → app tracks macros
   per gram and remaining batch across days
6. **Pantry**: items the user has; filled by barcode/receipt scan
7. **Plan a meal**: pick carb → pick protein (from pictures) → app suggests
   dishes using ONLY pantry items that fit the diet
8. **Import recipe**: paste URL (main) or screenshot (backup) → AI reads it →
   scale to user's macros
9. **Log weight**: one-tap daily entry
10. **Log measurements**: weekly waist/arms/thighs/hips
11. **The Coach**: weekly review of weight + measurements + activity + food →
    adjust macros and explain in plain words

---

## The Coach math (no AI needed — use formulas + rules)

- **Macro target:** Mifflin–St Jeor BMR + activity (from Fitbit/Apple) = TDEE.
  Subtract a deficit for weight loss. Split: high protein, rest carbs/fat.
- **Weekly adjust rule:** compare this week's avg weight to last week's avg.
  - Losing at a healthy rate → keep macros
  - Not losing → cut calories a little
  - Losing too fast → add a little
  - Weight flat BUT waist down → hold; explain it's fat loss
- Always use trailing averages, never a single day's weight.

## Where AI is used (user's own API key)

- Reading a grocery screenshot into a list of ingredients (vision)
- Reading a recipe from a URL or screenshot
- Suggesting dishes from pantry + diet + remaining macros

---

## Data sources

- **Fitbit (Android owner):** OAuth 2.0 Web API for workouts + sleep.
  Note: Fitbit's legacy Web API is being turned down ~Sept 2026 and migrating
  to the Google Health API. Build the fetch layer behind one module so we can
  swap endpoints without touching the rest of the app.
- **Apple Watch (iPhone owner):** we do NOT build an iOS app. The user installs
  "Health Auto Export" which POSTs their health data to an ingest endpoint we
  host (`/api/ingest/apple`). Store it in the `activity` table.
- **Diet, weight, measurements, pantry:** entered in-app.

---

## Build in phases (walking skeleton first)

**Phase 1 — Skeleton**
Next.js + Tailwind + Supabase. Google sign-in. Empty home screen with bottom
nav. Deploy to Vercel. Prove the loop works end to end.

**Phase 2 — Manual tracking**
Onboarding (diet + stats). Coach math for macro targets. Manual food log,
daily weight, weekly measurements. Home shows "macros left today".

**Phase 3 — Easy food input**
Barcode scan + Open Food Facts. Favourites. Batch cooking. Pantry.

**Phase 4 — The smart parts (AI, bring-your-own-key)**
Grocery screenshot → ingredients. Recipe import (URL/screenshot). Plan-a-meal
suggestions from pantry + diet.

**Phase 5 — Auto data + coaching**
Fitbit connect. Apple ingest endpoint. Weekly review + macro auto-adjust.

**Phase 6 — Polish**
PWA install, Duolingo-style UI pass, onboarding for new public users.

Ship and test each phase before starting the next.

---

## First things to do

1. `npx create-next-app@latest scoop --typescript --tailwind --app`
2. Create a Supabase project; add Google as an auth provider.
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Build Phase 1, deploy to Vercel, confirm sign-in works.

Keep secrets in `.env.local` (never commit). Ask before adding any paid tool.
