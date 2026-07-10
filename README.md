# Scoop

A mobile-first weight-loss coach app. Instead of searching foods, Scoop tells
you the portion to eat to hit your macros. Built with Next.js, Tailwind and
Supabase.

See [`CLAUDE.md`](./CLAUDE.md) for the full product plan and build phases.

## Tech stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Supabase** — Postgres + Google OAuth
- **Vercel** — hosting

## Prerequisites

- Node.js 20+ (built on Node 24)
- A [Supabase](https://supabase.com) account (free tier)
- A Google account (for the OAuth provider)

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create your env file**

   ```bash
   cp .env.local.example .env.local
   ```

   Then fill in the two values (see "Supabase setup" below):

   | Variable                        | Where to find it                                  |
   | ------------------------------- | ------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → Data API → URL      |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → anon key |

   `.env.local` is git-ignored — never commit real keys.

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. You should be redirected to `/login` and can
   sign in with Google.

## Supabase setup

You need this before local sign-in works.

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Copy the **Project URL** and **anon public key** into `.env.local`
   (see the table above).
3. **Enable Google auth:**
   - In Supabase: **Authentication → Sign In / Providers → Google**, toggle it on.
   - Supabase shows a **callback URL** like
     `https://<your-project-ref>.supabase.co/auth/v1/callback`. Copy it.
   - In the [Google Cloud Console](https://console.cloud.google.com):
     - Create (or pick) a project.
     - **APIs & Services → OAuth consent screen** — configure it (External),
       add your email as a test user.
     - **APIs & Services → Credentials → Create credentials → OAuth client ID**
       → **Web application**.
     - Under **Authorized redirect URIs**, paste the Supabase callback URL
       from above.
     - Copy the generated **Client ID** and **Client secret** back into the
       Supabase Google provider settings and save.
4. **Set redirect URLs in Supabase** (**Authentication → URL Configuration**):
   - **Site URL:** `http://localhost:3000` for local dev.
   - **Redirect URLs:** add `http://localhost:3000/**` (and later your Vercel
     URL, e.g. `https://scoop.vercel.app/**`).

Restart `npm run dev` after editing `.env.local`.

## Database migrations

The app tables live in [`supabase/migrations`](./supabase/migrations). Apply
them before running Phase 2 features:

- **Supabase SQL Editor:** open each `.sql` file in order and run it.
- Or with the Supabase CLI: `supabase db push`.

`0001_phase2_schema.sql` creates `users`, `weights`, `measurements`,
`food_logs` and `daily_targets`, all row-level-secured to the signed-in user.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com), **Add New → Project** and import the repo.
   Framework preset is detected as Next.js — no build config needed.
3. Add the same env vars in **Project → Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Then, back in Supabase:
   - Add your Vercel URL to **Authentication → URL Configuration → Redirect
     URLs** (`https://your-app.vercel.app/**`).
   - Optionally set the **Site URL** to the Vercel URL.
5. In Google Cloud Console, the Supabase callback URL stays the same, so no
   change is needed there for production.

## Scripts

| Command         | Does                       |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint                 |

## Project structure

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
