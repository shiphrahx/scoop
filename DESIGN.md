# Scoop design system

Light, airy, frosted glass. A premium health coach: teal→blue gradients, a violet
accent used sparingly, green means progress. **Light theme only** — no dark mode.
**No emojis anywhere** — use `lucide-react` line icons.

Every token and component class lives in `src/app/globals.css`. Reuse them; don't
hard-code palette values in components.

## Tokens (`:root` in `globals.css`)

**Surface + text**
- `--background` — page background (cool near-white)
- `--foreground` — primary ink
- `--muted` — secondary text
- `--border` — hairline borders

**Palette (single source for every colour)**
- `--g-green` `#22c55e` — health / progress
- `--g-teal` `#14b8a6`
- `--g-blue` `#3b82f6`
- `--accent` `#8b5cf6` — violet, sparingly (e.g. exercise-burn bars)

**Named gradients**
- `--grad-primary` green→teal — primary buttons, hero fills
- `--grad-cool` teal→blue — accent text/numbers
- `--grad-progress` conic — the progress ring motif

**Glass** — `--glass-bg`, `--glass-bg-solid`, `--glass-border`, `--glass-blur`
**Shape/depth** — `--radius`, `--radius-lg`, `--radius-sm`, `--shadow-soft`, `--shadow-glow`

## Component classes

- `.sc-card` — frosted panel, the workhorse surface. `.sc-card-solid` for dense/text-heavy panels.
- `.sc-btn` + one of:
  - `.sc-btn-primary` — gradient + glow. The single main action on a screen.
  - `.sc-btn-soft` — teal-tinted secondary action.
  - `.sc-btn-neutral` — glassy neutral action.
- `.sc-chip` — pill for tap-to-choose tiles and tags. `data-active="true"` fills it with the primary gradient.
- `.sc-grad-text` — gradient text for hero numbers/labels.
- `.sc-input` — quiet glassy input. Typing is the fallback, not the star.
- `.sc-bg` — fixed pastel background blobs (mounted once in the app layout).

## Charts

Hand-rolled SVG (`Charts.tsx`, `ProgressRing.tsx`, `MacroBar.tsx`). Gradient stops
and strokes use the palette tokens via `var(--g-…)` so charts stay in the family.
Empty state: dashed-border card reading "No data yet".

## Rules of thumb

- One `.sc-btn-primary` per screen — the obvious next tap.
- Big tap targets, generous radii, mobile-first. Prefer chips/tiles/scan over typing.
- Icons: `lucide-react`, consistent sizes. **Never** emojis (including in button labels).
- Empty / loading / error states are first-class: use a card + muted text, not a blank screen.
- Respect `prefers-reduced-motion` (handled globally in `globals.css`).
- Never introduce a `dark:` style — the variant is rebound to an unused class on purpose.
