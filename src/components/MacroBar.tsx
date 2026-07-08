// A single macro progress bar: consumed vs target grams.
export default function MacroBar({
  label,
  consumed,
  target,
  gradient = "linear-gradient(90deg, var(--g-green), var(--g-teal))",
}: {
  label: string;
  consumed: number;
  target: number;
  gradient?: string;
}) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const left = Math.max(0, Math.round(target - consumed));
  const over = consumed > target && target > 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-[var(--muted)]">
          {over ? (
            <span className="font-semibold text-amber-600">
              {Math.round(consumed - target)}g over
            </span>
          ) : (
            <>
              <span className="font-semibold text-[var(--foreground)]">
                {left}g
              </span>{" "}
              left
            </>
          )}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[rgba(15,23,42,0.06)]">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: gradient }}
        />
      </div>
    </div>
  );
}
