# Scoop

You want lose fat. Normal food app make you hunt, type, guess. Bad. Much work.

Scoop flip it. You no search food. **Scoop tell you how much to eat.** It know
your body numbers, know your food shelf, do the math. You just eat right amount.
Tap tap. Done.

Phone-first. Big buttons. Little typing. Feel like Duolingo but for belly.

Want full cave-plan and build steps? Look [`CLAUDE.md`](./CLAUDE.md).

## What make Scoop go (tools)

- **Next.js 16** — app brain (App Router, TypeScript)
- **Tailwind CSS v4** — make screen pretty
- **Supabase** — keep your stuff (Postgres) + Google door (OAuth)
- **Vercel** — put app on internet

## Before you start (need these)

- Node.js 20+ (we build on Node 24)
- [Supabase](https://supabase.com) account (free)
- Google account (for the sign-in door)

## Run on your machine

1. **Get the pieces**

   ```bash
   npm install
   ```

2. **Make secret file**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill two things (see "Supabase setup" below):

   | Variable                        | Where to find it                                  |
   | ------------------------------- | ------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → Data API → URL      |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → anon key |

   `.env.local` hidden from git — never put real keys in commit.

3. **Start the fire (dev server)**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. It throw you to `/login`. Sign in with Google.

## Supabase setup

Need this or sign-in no work.

1. Make project at [supabase.com](https://supabase.com) (free).
2. Copy **Project URL** and **anon public key** into `.env.local`
   (see table above).
3. **Turn on Google door:**
   - In Supabase: **Authentication → Sign In / Providers → Google**, flip it on.
   - Supabase show a **callback URL** like
     `https://<your-project-ref>.supabase.co/auth/v1/callback`. Copy it.
   - In [Google Cloud Console](https://console.cloud.google.com):
     - Make (or pick) a project.
     - **APIs & Services → OAuth consent screen** — set it up (External),
       add your email as test user.
     - **APIs & Services → Credentials → Create credentials → OAuth client ID**
       → **Web application**.
     - Under **Authorized redirect URIs**, paste the Supabase callback URL
       from above.
     - Copy the **Client ID** and **Client secret** back into the Supabase
       Google provider settings and save.
4. **Set redirect URLs in Supabase** (**Authentication → URL Configuration**):
   - **Site URL:** `http://localhost:3000` for local dev.
   - **Redirect URLs:** add `http://localhost:3000/**` (and later your Vercel
     URL, e.g. `https://scoop.vercel.app/**`).

Restart `npm run dev` after you touch `.env.local`.

## Database migrations

App tables live in [`supabase/migrations`](./supabase/migrations). Run them
before Phase 2 stuff work:

- **Supabase SQL Editor:** open each `.sql` file in order, run it.
- Or with Supabase CLI: `supabase db push`.

`0001_phase2_schema.sql` make `users`, `weights`, `measurements`, `food_logs`
and `daily_targets` — all locked to the signed-in user (row-level security).

## Put on internet (Vercel)

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com), **Add New → Project**, import the repo.
   It sniff out Next.js on its own — no build config needed.
3. Add same secret vars in **Project → Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Then back in Supabase:
   - Add your Vercel URL to **Authentication → URL Configuration → Redirect
     URLs** (`https://your-app.vercel.app/**`).
   - Maybe set **Site URL** to the Vercel URL too.
5. In Google Cloud Console, the Supabase callback URL stay the same, so no
   change needed there for production.

## Scripts (magic words)

| Command         | Does                       |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint                 |

## Where stuff live (project map)

```
src/
  app/
    (app)/            # signed-in screens (share the bottom-nav shell)
      layout.tsx      # auth guard + BottomNav
      page.tsx        # Home
      plan|add|progress|me/
    auth/
      callback/       # OAuth code exchange
      signout/        # sign-out route handler
    login/            # Google sign-in screen
  components/         # BottomNav, SignOutButton
  lib/supabase/       # browser client, server client, session helper
  proxy.ts            # session refresh + route guard (was "middleware")
```
