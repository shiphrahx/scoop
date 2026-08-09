# Scoop design system

Light, airy, frosted glass. A premium health coach: teal→blue gradients, a violet
accent used sparingly, green means progress. **Light theme only**, no dark mode.
**No emojis anywhere**, use `lucide-react` line icons.

Every token and component class lives in `src/app/globals.css`. Reuse them; don't
hard-code palette values in components.

## Tokens (`:root` in `globals.css`)

**Surface + text**
- `--background`, page background (cool near-white)
- `--foreground`, primary ink
- `--muted`, secondary text
- `--border`, hairline borders

**Palette (single source for every colour)**
- `--g-green` `#22c55e`, health / progress
- `--g-teal` `#14b8a6`
- `--g-blue` `#3b82f6`
- `--accent` `#8b5cf6`, violet, sparingly (e.g. exercise-burn bars)

**Tints, fills, accent inks** (derived from the palette; use instead of inline rgba/hex)
- `--tint-teal`, selection / badge background
- `--tint-green`, positive / saved background
- `--fill-soft`, subtle surface fill (rows, panels)
- `--fill`, control fill (steppers, progress tracks)
- `--ink-teal`, dark teal accent text
- `--ink-green`, positive accent text

**Named gradients**
- `--grad-primary` green→teal, primary buttons, hero fills
- `--grad-cool` teal→blue, accent text/numbers
- `--grad-warm` orange→amber, calories stat tile
- `--grad-indigo` indigo→violet, sleep stat tile
- `--grad-progress` conic, the progress ring motif

**Glass**, `--glass-bg`, `--glass-bg-solid`, `--glass-border`, `--glass-blur`
**Scrim**, `--scrim`, the dimmer behind a modal sheet
**Shape/depth**, `--radius`, `--radius-lg`, `--radius-sm`, `--shadow-soft`, `--shadow-glow`

## Component classes

- `.sc-card`, frosted panel, the workhorse surface. `.sc-card-solid` for dense/text-heavy panels.
- `.sc-grad-panel`, gradient-filled panel with glow, for closing calls to action.
- `.sc-icon-tile`, icon on a rounded gradient square. `.sc-icon-tile-soft` is the teal-tinted quiet version; `.sc-icon-dot` is the small round one for checklist bullets.
- `.sc-btn` + one of:
  - `.sc-btn-primary`, gradient + glow. The single main action on a screen.
  - `.sc-btn-soft`, teal-tinted secondary action.
  - `.sc-btn-neutral`, glassy neutral action.
- `.sc-chip`, pill for tap-to-choose tiles and tags. `data-active="true"` fills it with the primary gradient.
- `.sc-grad-text`, gradient text for hero numbers/labels.
- `.sc-input`, quiet glassy input. Typing is the fallback, not the star.
- `.sc-bg`, fixed pastel background blobs (mounted once in the app layout).

## Charts

Recharts in `Charts.tsx`; hand-rolled SVG in `ProgressRing.tsx` / `MacroBar.tsx`.
Gradient stops and strokes use the palette tokens so charts stay in the family.
Empty state: dashed-border card reading "No data yet".

Rules the chart set holds to:
- **Never a dual axis.** Two measures on different scales become synced small
  multiples sharing one x (`WeightVsExercise`), never two y-scales on one plot.
- **A legend whenever there are two series**, plus a stat row or direct labels.
  The teal and green fills sit under 3:1 against the surface, so a number always
  accompanies the colour.
- Recessive grid and axes, thin marks, hover tooltips on every plot.
- Categorical order is fixed: teal → blue → green → violet. Validated for
  colour-vision deficiency; don't substitute hues per chart.

Charts available: `WeightTrendChart`, `TrendDotsChart` (raw dots + smoothed
line), `WeightVsExercise`, `MeasurementsChart`, `SleepChart`, `DriverScatter`
(weekly habit vs kg lost, with a fitted line), `WeeklyIntakeChart` (eaten vs
target), `CompareBars` (two labelled quantities, plain markup).

## Rules of thumb

- One `.sc-btn-primary` per screen, the obvious next tap.
- Big tap targets, generous radii, mobile-first. Prefer chips/tiles/scan over typing.
- Icons: `lucide-react`, consistent sizes. **Never** emojis (including in button labels).
- Empty / loading / error states are first-class: use a card + muted text, not a blank screen.
- Respect `prefers-reduced-motion` (handled globally in `globals.css`).
- Never introduce a `dark:` style, the variant is rebound to an unused class on purpose.

## Screen & component inventory (design-system coverage)

Every route below and its loading / empty / error states use the system above
(`.sc-*` classes + palette tokens, line icons, no emojis).

Routes (`src/app/`):
- [x] `login/`
- [x] `onboarding/` (multi-step flow)
- [x] `(app)/` home, `home/MobileHome`, `home/DesktopDashboard`
- [x] `(app)/add/`, form, favourites, delete
- [x] `(app)/plan/`, carb/protein tiles, suggestions (empty: "add pantry items")
- [x] `(app)/plan/recipe/`, import (link keyless / screenshot gated), saved recipes
- [x] `(app)/pantry/`, list/edit, barcode, list import, invoice import, screenshot (gated), matcher
- [x] `(app)/batches/`
- [x] `(app)/progress/`, an `ActionBar` (log weight / check in, two buttons on
      one row, the weight stepper in a sheet) over the tabbed insights dashboard
- [x] `(app)/progress/insights/`, the dashboard: a KPI row, one primary chart,
      then compact cards in four tabs. Rules it holds to:
      - **Nothing is hidden for want of data.** An insight with no data yet is a
        `LockedInsight` and renders as a `LockedCard` in the same grid slot:
        dashed, muted, lock icon, no numbers, and a line saying what it would
        tell you plus what unlocks it (a Connect button when it needs a
        wearable). Hiding these would hide the reason to log anything. Cards
        with data sort first. Never a full-height "needs more data" panel.
      - **KPI row first** (`KpiRow` / `KpiTile`): now, per week, % to goal, goal
        date, only the ones with a number, since a row of dashes says nothing;
        the missing ones appear as locked cards below instead. Each tile opens
        its detail.
      - **One primary chart** (weight trend over raw dots + range toggle) on
        Overview. Every other chart lives inside a card's detail drawer.
      - **Grid, not a stack** (`InsightGrid`): two across on a phone, three from
        `lg`. Cards are `CompactCard`, a headline figure, tap to open the full
        detail in `Drawer` (bottom sheet on a phone, centred panel from `sm`).
      - Tabs (`Tabs.tsx`, all panels stay mounted): **Overview** (KPIs, weight
        chart, fat-loss callout, plateau alert, this week, milestones),
        **Body** (waist-to-height, measurements, then-and-now photo wipe, past
        check-ins), **Drivers** (sleep / movement / adherence scatters, high-day
        impact), **Adherence** (eaten vs target, weekday vs weekend, wins log).
      - `PatternNote` ("patterns, not proof") on every correlation card;
        `NeedsMoreData` only for an empty *part* of an open card; `Expandable`
        for detail that would crowd even the drawer.
- [x] `(app)/progress/check-in/`, weekly check-in form, deltas vs last week,
      optional private photos
- [x] `(app)/coach/`, weekly review, activity list (empty: connect devices)
- [x] `(app)/me/`, goals, devices (Fitbit/Apple), API key

Shared components (`src/components/`):
- [x] `BottomNav`, `Sidebar`, `nav-items`
- [x] `Charts`, `ProgressRing`, `MacroBar`, colours from palette tokens
- [x] `BarcodeScanner`, full-screen camera (intentionally dark; not a glass surface)
- [x] `SignOutButton`, `ServiceWorkerRegister`

States handled: empty (pantry, suggestions, activity, charts "No data yet"),
loading (notes + spinners), error (thrown messages surfaced in each card's note).
