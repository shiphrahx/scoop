// Hand-rolled SVG charts for the desktop dashboard. No chart library.
// Gradient area fills + rings share the app's green→teal→blue family.
// All render server-side (static); they scale to their container width.

const VBW = 320; // viewBox width — svg stretches to fit its container
const PAD = { t: 14, r: 10, b: 22, l: 10 };

type Point = { label: string; value: number };

function scale(values: number[], h: number, pad = 0.12) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * pad;
  const hi = max + span * pad;
  const range = hi - lo || 1;
  const top = PAD.t;
  const bottom = h - PAD.b;
  return (v: number) => bottom - ((v - lo) / range) * (bottom - top);
}

function xs(n: number) {
  const left = PAD.l;
  const right = VBW - PAD.r;
  return (i: number) => (n <= 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));
}

// Smooth-ish area + line trend (weight, sleep hours as a line, etc.).
export function AreaTrend({
  points,
  height = 150,
  unit = "",
  id,
}: {
  points: Point[];
  height?: number;
  unit?: string;
  id: string;
}) {
  if (points.length === 0) return <EmptyChart height={height} />;
  const y = scale(points.map((p) => p.value), height);
  const x = xs(points.length);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${height - PAD.b} L ${x(0).toFixed(1)} ${height - PAD.b} Z`;
  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${VBW} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke={`url(#${id}-stroke)`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="3.5" fill="#3b82f6" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
        <span>{points[0].label}</span>
        <span className="font-semibold text-[var(--foreground)]">
          {last.value}
          {unit}
        </span>
      </div>
    </div>
  );
}

// Weight (line) over exercise burn (bars) — do they move together?
export function WeightVsExercise({
  weights,
  burn,
  height = 170,
  id,
}: {
  weights: Point[];
  burn: Point[];
  height?: number;
  id: string;
}) {
  if (weights.length === 0 && burn.length === 0) return <EmptyChart height={height} />;
  const n = Math.max(weights.length, burn.length);
  const x = xs(n);
  const barW = Math.max(4, (VBW - PAD.l - PAD.r) / (n * 1.8));

  const burnY = burn.length
    ? scale([0, ...burn.map((p) => p.value)], height, 0)
    : () => height - PAD.b;
  const wY = weights.length ? scale(weights.map((p) => p.value), height) : () => height / 2;
  const wLine = weights
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${wY(p.value).toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${VBW} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        {burn.map((p, i) => {
          const top = burnY(p.value);
          return (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={Math.max(0, height - PAD.b - top)}
              rx={barW / 2.5}
              fill={`url(#${id}-bar)`}
            />
          );
        })}
        {weights.length > 0 && (
          <path
            d={wLine}
            fill="none"
            stroke={`url(#${id}-line)`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-[var(--muted)]">
        <Legend color="#14b8a6">Weight</Legend>
        <Legend color="#8b5cf6">Exercise burn</Legend>
      </div>
    </div>
  );
}

// Sleep hours per night — soft gradient bars.
export function SleepBars({
  points,
  height = 150,
  id,
}: {
  points: Point[];
  height?: number;
  id: string;
}) {
  if (points.length === 0) return <EmptyChart height={height} />;
  const x = xs(points.length);
  const y = scale([0, ...points.map((p) => p.value)], height, 0);
  const barW = Math.max(6, (VBW - PAD.l - PAD.r) / (points.length * 1.6));
  const avg = points.reduce((s, p) => s + p.value, 0) / points.length;

  return (
    <div>
      <svg viewBox={`0 0 ${VBW} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-sleep`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {points.map((p, i) => {
          const top = y(p.value);
          return (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={Math.max(0, height - PAD.b - top)}
              rx={barW / 2.5}
              fill={`url(#${id}-sleep)`}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
        <span>Last {points.length} nights</span>
        <span className="font-semibold text-[var(--foreground)]">
          {avg.toFixed(1)}h avg
        </span>
      </div>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
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
