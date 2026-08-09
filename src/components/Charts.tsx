"use client";

// Interactive dashboard charts built on Recharts. Hover for per-day detail;
// legends and reference lines give the numbers context. Light theme only,
// palette drawn from the app's green→teal→blue→violet family.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const C = {
  teal: "#14b8a6",
  green: "#22c55e",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  grid: "rgba(15, 23, 42, 0.06)",
  axis: "#94a3b8",
  muted: "#64748b",
  ink: "#0f172a",
} as const;

const AXIS_TICK = { fontSize: 11, fill: C.muted } as const;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

// A "19 Jul" label is ~40px wide. Recharts drops a tick only when the gap to
// its neighbour is under minTickGap, so this must clear the label itself,
// otherwise labels touch on narrow cards even at a wide `interval`.
const DATE_TICK_GAP = 44;

// ── Shared tooltip shell ────────────────────────────────────────────
function TooltipCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color: string }[];
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1.5 font-semibold text-[var(--foreground)]">{title}</p>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: r.color }}
            />
            <span className="text-[var(--muted)]">{r.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-[var(--foreground)]">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p
        className="text-sm font-semibold tabular-nums"
        style={{ color: tint ?? "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div
      className="grid place-items-center rounded-2xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)]"
      style={{ height }}
    >
      No data yet
    </div>
  );
}

// ── Weight trend ────────────────────────────────────────────────────
export function WeightTrendChart({
  data,
  height = 200,
}: {
  data: { date: string; weight: number }[];
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;

  const weights = data.map((d) => d.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
  const pad = (max - min) * 0.2 || 1;
  const first = data[0].weight;
  const last = data[data.length - 1].weight;
  const change = Math.round((last - first) * 10) / 10;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="wt-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.teal} stopOpacity={0.32} />
              <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={DATE_TICK_GAP}
          />
          <YAxis
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={34}
            tickFormatter={(v) => `${v}`}
          />
          <ReferenceLine
            y={avg}
            stroke={C.muted}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: `avg ${avg.toFixed(1)}`,
              position: "insideTopRight",
              fontSize: 10,
              fill: C.muted,
            }}
          />
          <Tooltip
            cursor={{ stroke: C.teal, strokeWidth: 1, strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { date: string; weight: number };
              const i = data.findIndex((d) => d.date === p.date);
              const delta = i > 0 ? p.weight - data[i - 1].weight : 0;
              const rows: { label: string; value: string; color: string }[] = [
                { label: "Weight", value: `${p.weight.toFixed(1)} kg`, color: C.teal },
              ];
              if (i > 0) {
                rows.push({
                  label: "vs prev",
                  value: `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`,
                  color: delta <= 0 ? C.green : C.violet,
                });
              }
              return <TooltipCard title={longDate(p.date)} rows={rows} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke={C.teal}
            strokeWidth={2.5}
            fill="url(#wt-fill)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: C.teal }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <Stat label="Current" value={`${last.toFixed(1)} kg`} />
        <Stat
          label="Change"
          value={`${change > 0 ? "+" : ""}${change.toFixed(1)} kg`}
          tint={change <= 0 ? "var(--ink-green)" : "var(--accent)"}
        />
        <Stat label="Range" value={`${min.toFixed(1)}–${max.toFixed(1)}`} />
        <Stat label="Logs" value={`${data.length}`} />
      </div>
    </div>
  );
}

// ── Trend line over the raw dots ────────────────────────────────────
// The daily weigh-ins as recessive dots with the smoothed trend drawn through
// them. Two encodings of the same measure, so they share one axis: the dots are
// the user's data, the line is what it means.
export function TrendDotsChart({
  data,
  height = 220,
}: {
  data: { date: string; weight: number | null; trend: number }[];
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;

  const values = data.flatMap((d) => (d.weight == null ? [d.trend] : [d.weight, d.trend]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;
  const logs = data.filter((d) => d.weight != null).length;
  const change = data[data.length - 1].trend - data[0].trend;

  return (
    <div>
      <div className="mb-2 flex gap-4">
        <Legend color={C.axis}>Weigh-ins</Legend>
        <Legend color={C.teal}>Trend</Legend>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={DATE_TICK_GAP}
          />
          <YAxis
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <Tooltip
            cursor={{ stroke: C.teal, strokeWidth: 1, strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as {
                date: string;
                weight: number | null;
                trend: number;
              };
              const rows: { label: string; value: string; color: string }[] = [
                { label: "Trend", value: `${p.trend.toFixed(1)} kg`, color: C.teal },
              ];
              if (p.weight != null) {
                rows.unshift({
                  label: "Weighed",
                  value: `${p.weight.toFixed(1)} kg`,
                  color: C.axis,
                });
              }
              return <TooltipCard title={longDate(p.date)} rows={rows} />;
            }}
          />
          {/* Raw readings: dots only, never joined, a line between two weigh-ins
              four days apart draws a journey the body didn't take. */}
          <Line
            type="monotone"
            dataKey="weight"
            stroke="none"
            dot={{ r: 2.5, strokeWidth: 0, fill: C.axis }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: C.axis }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="trend"
            stroke={C.teal}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: C.teal }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <Stat label="Trend now" value={`${data[data.length - 1].trend.toFixed(1)} kg`} />
        <Stat
          label="Change"
          value={`${change > 0 ? "+" : ""}${change.toFixed(1)} kg`}
          tint={change <= 0 ? "var(--ink-green)" : "var(--accent)"}
        />
        <Stat label="Range" value={`${min.toFixed(1)}–${max.toFixed(1)}`} />
        <Stat label="Weigh-ins" value={`${logs}`} />
      </div>
    </div>
  );
}

// ── Weight vs exercise (synced small multiples, never a dual axis) ──
export function WeightVsExercise({
  weights,
  burn,
  height = 200,
}: {
  weights: { date: string; weight: number }[];
  burn: { date: string; kcal: number }[];
  height?: number;
}) {
  if (weights.length === 0 && burn.length === 0) return <EmptyChart height={height} />;

  // Merge onto one shared, sorted date axis so both panels line up.
  const byDate = new Map<string, { date: string; weight?: number; kcal?: number }>();
  for (const w of weights) byDate.set(w.date, { ...byDate.get(w.date), date: w.date, weight: w.weight });
  for (const b of burn) byDate.set(b.date, { ...byDate.get(b.date), date: b.date, kcal: b.kcal });
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const panelH = (height - 26) / 2;
  const margin = { top: 6, right: 8, left: -8, bottom: 0 };

  return (
    <div>
      <div className="mb-2 flex gap-4">
        <Legend color={C.teal}>Weight (kg)</Legend>
        <Legend color={C.violet}>Exercise burn (kcal)</Legend>
      </div>

      {/* Top panel: weight line */}
      <ResponsiveContainer width="100%" height={panelH}>
        <LineChart data={merged} syncId="wve" margin={margin}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="date" hide />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={34}
            domain={["dataMin - 1", "dataMax + 1"]}
            allowDecimals={false}
          />
          {/* Crosshair only. The card lives on the bottom panel, syncId fires
              both panels' tooltips at once, so two cards would be identical. */}
          <Tooltip
            cursor={{ stroke: C.teal, strokeWidth: 1, strokeDasharray: "4 4" }}
            content={() => null}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke={C.teal}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: C.teal }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Bottom panel: exercise burn bars, shares the x-axis via syncId */}
      <ResponsiveContainer width="100%" height={panelH + 18}>
        <BarChart data={merged} syncId="wve" margin={{ ...margin, bottom: 0 }}>
          <defs>
            <linearGradient id="wve-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.violet} stopOpacity={0.85} />
              <stop offset="100%" stopColor={C.violet} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={DATE_TICK_GAP}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={34}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(139, 92, 246, 0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { date: string; weight?: number; kcal?: number };
              const rows: { label: string; value: string; color: string }[] = [];
              if (p.weight != null)
                rows.push({ label: "Weight", value: `${p.weight.toFixed(1)} kg`, color: C.teal });
              if (p.kcal != null)
                rows.push({ label: "Burn", value: `${Math.round(p.kcal)} kcal`, color: C.violet });
              if (!rows.length) return null;
              return <TooltipCard title={longDate(p.date)} rows={rows} />;
            }}
          />
          <Bar dataKey="kcal" fill="url(#wve-bar)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Weekly driver scatter ───────────────────────────────────────────
// One dot per week: a habit on x, kilos lost on y, with the fitted line through
// them. A scatter is the honest form here, it shows the spread the single
// correlation number hides, which is the whole point of calling these patterns
// rather than proof.
export function DriverScatter({
  points,
  xLabel,
  xUnit,
  height = 200,
}: {
  points: { weekStart: string; x: number; y: number }[];
  xLabel: string;
  xUnit: string;
  height?: number;
}) {
  if (points.length === 0) return <EmptyChart height={height} />;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.1 || 1;
  const yPad = (yMax - yMin) * 0.15 || 0.2;

  // Least-squares line, drawn edge to edge so the eye has something to follow.
  const n = points.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const at = (x: number) => yMean + slope * (x - xMean);
  const fit: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: xMin, y: at(xMin) },
    { x: xMax, y: at(xMax) },
  ];

  const fmtX = (v: number) =>
    Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v * 10) / 10}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
        <CartesianGrid stroke={C.grid} />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          domain={[xMin - xPad, xMax + xPad]}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtX}
          label={{
            value: `${xLabel} (${xUnit})`,
            position: "insideBottom",
            offset: -12,
            fontSize: 11,
            fill: C.muted,
          }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="kg lost"
          domain={[yMin - yPad, yMax + yPad]}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={38}
          tickFormatter={(v) => `${Math.round(v * 10) / 10}`}
        />
        {/* Zero is the line that matters: dots below it are weeks that gained. */}
        <ReferenceLine y={0} stroke={C.axis} strokeOpacity={0.5} />
        <ReferenceLine
          segment={fit}
          stroke={C.teal}
          strokeWidth={2}
          strokeDasharray="5 4"
          ifOverflow="extendDomain"
        />
        <Tooltip
          cursor={{ stroke: C.teal, strokeWidth: 1, strokeDasharray: "4 4" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { weekStart: string; x: number; y: number };
            return (
              <TooltipCard
                title={`Week of ${shortDate(p.weekStart)}`}
                rows={[
                  { label: xLabel, value: `${fmtX(p.x)} ${xUnit}`, color: C.blue },
                  {
                    label: "Lost",
                    value: `${(Math.round(p.y * 100) / 100).toFixed(2)} kg`,
                    color: p.y >= 0 ? C.green : C.violet,
                  },
                ]}
              />
            );
          }}
        />
        <Scatter
          data={points}
          fill={C.blue}
          shape="circle"
          isAnimationActive={false}
          r={5}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ── Measurements over time ──────────────────────────────────────────
// One tape measurement (waist, chest…) plotted from the weekly check-ins. The
// series to show is chosen by the parent; this just draws it. A shrinking line
// is the win, so the change stat greens when it falls.
export function MeasurementsChart({
  data,
  label,
  height = 200,
}: {
  data: { date: string; value: number }[];
  label: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.2 || 1;
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const change = Math.round((last - first) * 10) / 10;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="meas-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
              <stop offset="100%" stopColor={C.teal} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={DATE_TICK_GAP}
          />
          <YAxis
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <Tooltip
            cursor={{ stroke: C.green, strokeWidth: 1, strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { date: string; value: number };
              const i = data.findIndex((d) => d.date === p.date);
              const rows: { label: string; value: string; color: string }[] = [
                { label, value: `${p.value.toFixed(1)} cm`, color: C.green },
              ];
              if (i > 0) {
                const delta = p.value - data[i - 1].value;
                rows.push({
                  label: "vs prev",
                  value: `${delta > 0 ? "+" : ""}${delta.toFixed(1)} cm`,
                  color: delta <= 0 ? C.green : C.violet,
                });
              }
              return <TooltipCard title={longDate(p.date)} rows={rows} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={C.green}
            strokeWidth={2.5}
            fill="url(#meas-fill)"
            dot={{ r: 3, strokeWidth: 0, fill: C.green }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: C.green }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <Stat label="Current" value={`${last.toFixed(1)} cm`} />
        <Stat
          label="Change"
          value={`${change > 0 ? "+" : ""}${change.toFixed(1)} cm`}
          tint={change <= 0 ? "var(--ink-green)" : "var(--accent)"}
        />
        <Stat label="Range" value={`${min.toFixed(1)}–${max.toFixed(1)}`} />
        <Stat label="Points" value={`${data.length}`} />
      </div>
    </div>
  );
}

// ── Two-group comparison ────────────────────────────────────────────
// Two or three labelled quantities side by side (weekday vs weekend, high-day
// weeks vs the rest). Plain markup rather than a plotting library: at this size
// axes and gridlines are noise, and every bar carries its own number, which is
// also the relief for these fills sitting under 3:1 against the surface.
export function CompareBars({
  rows,
  unit,
  decimals = 0,
}: {
  rows: { label: string; value: number; tint?: "teal" | "violet" | "green" }[];
  unit: string;
  decimals?: number;
}) {
  if (rows.length === 0) return <EmptyChart height={120} />;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const fill = { teal: C.teal, violet: C.violet, green: C.green } as const;

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[var(--muted)]">{r.label}</span>
            <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
              {r.value.toFixed(decimals)} {unit}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--fill)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`,
                background: fill[r.tint ?? "teal"],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Weekly intake against the week's target ─────────────────────────
// Bars are what was eaten on an average logged day that week; the line is what
// was asked for. One axis, both in kcal.
export function WeeklyIntakeChart({
  data,
  height = 200,
}: {
  data: { weekStart: string; actual: number; target: number }[];
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;

  return (
    <div>
      <div className="mb-2 flex gap-4">
        <Legend color={C.teal}>Eaten (daily avg)</Legend>
        <Legend color={C.violet}>Target</Legend>
      </div>
      <ResponsiveContainer width="100%" height={height - 24}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="wk-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.teal} stopOpacity={0.9} />
              <stop offset="100%" stopColor={C.teal} stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={DATE_TICK_GAP}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={42}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(20, 184, 166, 0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as {
                weekStart: string;
                actual: number;
                target: number;
              };
              const delta = p.actual - p.target;
              return (
                <TooltipCard
                  title={`Week of ${shortDate(p.weekStart)}`}
                  rows={[
                    { label: "Eaten", value: `${Math.round(p.actual)} kcal`, color: C.teal },
                    { label: "Target", value: `${Math.round(p.target)} kcal`, color: C.violet },
                    {
                      label: "Gap",
                      value: `${delta > 0 ? "+" : ""}${Math.round(delta)} kcal`,
                      color: Math.abs(delta) < 150 ? C.green : C.violet,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="actual" fill="url(#wk-bar)" radius={[4, 4, 0, 0]} maxBarSize={30} />
          <Line
            type="monotone"
            dataKey="target"
            stroke={C.violet}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Sleep ───────────────────────────────────────────────────────────
export function SleepChart({
  data,
  height = 200,
}: {
  data: { date: string; hours: number }[];
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart height={height} />;
  const avg = data.reduce((s, p) => s + p.hours, 0) / data.length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Legend color={C.blue}>Hours slept</Legend>
        <span className="text-xs text-[var(--muted)]">
          avg <span className="font-semibold text-[var(--foreground)]">{avg.toFixed(1)}h</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height - 24}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="slp-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.blue} stopOpacity={0.85} />
              <stop offset="100%" stopColor={C.teal} stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={DATE_TICK_GAP}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={34}
            allowDecimals={false}
          />
          <ReferenceLine
            y={avg}
            stroke={C.muted}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />
          <Tooltip
            cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { date: string; hours: number };
              return (
                <TooltipCard
                  title={longDate(p.date)}
                  rows={[{ label: "Sleep", value: `${p.hours.toFixed(1)} h`, color: C.blue }]}
                />
              );
            }}
          />
          <Bar dataKey="hours" fill="url(#slp-bar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
