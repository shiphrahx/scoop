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
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
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

// Space x-axis ticks so they never crowd on a 30-point series.
const tickInterval = (n: number) => Math.max(0, Math.floor(n / 6) - 1);

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
            interval={tickInterval(data.length)}
            minTickGap={16}
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

// ── Weight vs exercise (synced small multiples — never a dual axis) ──
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
          <Tooltip
            cursor={{ stroke: C.teal, strokeWidth: 1, strokeDasharray: "4 4" }}
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

      {/* Bottom panel: exercise burn bars — shares the x-axis via syncId */}
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
            interval={tickInterval(merged.length)}
            minTickGap={16}
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
            interval={tickInterval(data.length)}
            minTickGap={16}
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
