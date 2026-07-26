// Bounded linear least squares: minimise ||A·x − b||² subject to lb ≤ x ≤ ub.
//
// This is the one numeric primitive the meal planner needs. It replaces an
// active-set method that pinned a variable to a bound and never released it,
// which returned portions that were not the minimum of its own objective — a
// picked food could sit at zero grams because an early iteration put it there.
//
// The method here is cyclic coordinate descent. The objective is a convex
// quadratic and the feasible set is a box, so minimising one coordinate at a
// time has a closed form (clamped to that coordinate's bounds), every step
// decreases the objective, and no coordinate is ever locked: a variable pushed
// to a bound is free to leave it on the next sweep. For a strictly convex
// quadratic over a box that converges to the global minimum.

// A tiny ridge keeps a coordinate solvable when two foods have identical macro
// profiles (it splits grams between them instead of dividing by zero).
const RIDGE = 1e-9;

export interface BoxLsqOptions {
  // Stop when no coordinate moves more than this in a whole sweep.
  tol?: number;
  maxSweeps?: number;
  // Starting point; clamped into the box. Defaults to the lower bounds.
  start?: number[];
}

// ||A·x − b||², the value coordinate descent drives down. Exported so callers
// can compare candidate solutions (e.g. whole-unit alternatives) on exactly the
// objective the solver minimises.
export function lsqCost(A: number[][], b: number[], x: number[]): number {
  let c = 0;
  for (let r = 0; r < A.length; r++) {
    let dot = 0;
    const row = A[r];
    for (let j = 0; j < row.length; j++) dot += row[j] * x[j];
    const e = dot - b[r];
    c += e * e;
  }
  return c;
}

export function solveBoxLsq(
  A: number[][],
  b: number[],
  lb: number[],
  ub: number[],
  opts: BoxLsqOptions = {},
): number[] {
  const n = lb.length;
  const tol = opts.tol ?? 1e-7;
  const maxSweeps = opts.maxSweeps ?? 500;

  // Normal-equation pieces: AᵀA and Aᵀb. n is small (a day of picks), so the
  // n² matrix is cheap and lets each coordinate step be a couple of dot
  // products instead of a pass over every row.
  const AtA: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const Atb = new Array<number>(n).fill(0);
  for (const row of A) {
    for (let i = 0; i < n; i++) {
      if (row[i] === 0) continue;
      for (let j = i; j < n; j++) {
        const v = row[i] * row[j];
        AtA[i][j] += v;
        if (i !== j) AtA[j][i] += v;
      }
    }
  }
  for (let r = 0; r < A.length; r++) {
    for (let j = 0; j < n; j++) Atb[j] += A[r][j] * b[r];
  }

  const clamp = (v: number, i: number) => Math.max(lb[i], Math.min(ub[i], v));
  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) x[i] = clamp(opts.start?.[i] ?? lb[i], i);

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let moved = 0;
    for (let j = 0; j < n; j++) {
      const djj = AtA[j][j] + RIDGE;
      // A food that contributes to no row (all-zero column) has no optimum of
      // its own; leave it where it is rather than dividing by the ridge alone.
      if (djj <= RIDGE) continue;
      let rest = 0;
      const col = AtA[j];
      for (let i = 0; i < n; i++) if (i !== j) rest += col[i] * x[i];
      const next = clamp((Atb[j] - rest) / djj, j);
      moved = Math.max(moved, Math.abs(next - x[j]));
      x[j] = next;
    }
    if (moved < tol) break;
  }
  return x;
}
