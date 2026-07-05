// A single macro progress bar: consumed vs target grams.
export default function MacroBar({
  label,
  consumed,
  target,
  color,
}: {
  label: string;
  consumed: number;
  target: number;
  color: string;
}) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const left = Math.max(0, Math.round(target - consumed));
  const over = consumed > target && target > 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-extrabold">{label}</span>
        <span className="text-[var(--muted)]">
          {over ? (
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {Math.round(consumed - target)}g over
            </span>
          ) : (
            <>
              <span className="font-bold text-[var(--foreground)]">{left}g</span>{" "}
              left
            </>
          )}
        </span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${color} transition-[width] duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
