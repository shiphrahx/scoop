import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lsqCost, solveBoxLsq } from "@/lib/boxqp";

// The solver's promise: the value it returns is inside the box and is the
// minimum of ||A·x − b||² there. Everything the planner does rests on this, so
// it is checked against brute force and against random perturbations.

describe("solveBoxLsq", () => {
  it("solves an unconstrained system exactly", () => {
    // 2x + y = 5, x + 3y = 10 → x = 1, y = 3.
    const x = solveBoxLsq(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
      [-100, -100],
      [100, 100],
    );
    expect(x[0]).toBeCloseTo(1, 6);
    expect(x[1]).toBeCloseTo(3, 6);
  });

  it("clamps to the bounds and keeps the rest optimal", () => {
    // Wants x = 10 but x <= 4; y then absorbs what's left of the target.
    const A = [[1, 1]];
    const b = [10];
    const x = solveBoxLsq(A, b, [0, 0], [4, 100]);
    expect(x[0]).toBeLessThanOrEqual(4);
    expect(x[0] + x[1]).toBeCloseTo(10, 6);
  });

  it("never leaves a variable stuck at a bound it should have left", () => {
    // Starting every variable at its lower bound, the first coordinate is pushed
    // to zero by the second's first guess; a solver that could not release a
    // bound would return it at zero. The true optimum needs both.
    const A = [
      [1, 1],
      [1, -1],
    ];
    const b = [10, 0];
    const x = solveBoxLsq(A, b, [0, 0], [100, 100]);
    expect(x[0]).toBeCloseTo(5, 6);
    expect(x[1]).toBeCloseTo(5, 6);
  });

  it("returns the lower bounds when they already overshoot the target", () => {
    const x = solveBoxLsq([[1, 1]], [1], [5, 5], [50, 50]);
    expect(x).toEqual([5, 5]);
  });

  it("handles a food that contributes nothing", () => {
    // Second column is all zeros (a food with no macros): it must stay put and
    // not blow up the solve.
    const x = solveBoxLsq(
      [
        [2, 0],
        [1, 0],
      ],
      [4, 2],
      [0, 3],
      [100, 100],
    );
    expect(x[0]).toBeCloseTo(2, 6);
    expect(x[1]).toBe(3);
  });

  it("beats every nearby feasible point (random problems)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 3, maxLength: 3 }),
          { minLength: 2, maxLength: 5 },
        ),
        fc.array(fc.integer({ min: -50, max: 200 }), { minLength: 2, maxLength: 5 }),
        fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 3, maxLength: 3 }),
        (A, bRaw, lb) => {
          const b = bRaw.slice(0, A.length);
          while (b.length < A.length) b.push(0);
          const ub = lb.map((l) => l + 50);
          const x = solveBoxLsq(A, b, lb, ub);
          for (let i = 0; i < x.length; i++) {
            expect(x[i]).toBeGreaterThanOrEqual(lb[i] - 1e-6);
            expect(x[i]).toBeLessThanOrEqual(ub[i] + 1e-6);
          }
          const base = lsqCost(A, b, x);
          // No single-coordinate move improves it — the optimality condition
          // coordinate descent converges to.
          for (let i = 0; i < x.length; i++) {
            for (const d of [-2, -0.5, -0.05, 0.05, 0.5, 2]) {
              const t = [...x];
              t[i] = Math.max(lb[i], Math.min(ub[i], t[i] + d));
              expect(lsqCost(A, b, t)).toBeGreaterThanOrEqual(base - 1e-6);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("matches a brute-force grid search on small problems", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 5, max: 60 }),
        (a1, a2, target) => {
          const A = [[a1, a2]];
          const b = [target];
          const x = solveBoxLsq(A, b, [0, 0], [10, 10]);
          let best = Infinity;
          for (let i = 0; i <= 100; i++) {
            for (let j = 0; j <= 100; j++) {
              best = Math.min(best, lsqCost(A, b, [i / 10, j / 10]));
            }
          }
          expect(lsqCost(A, b, x)).toBeLessThanOrEqual(best + 1e-6);
        },
      ),
      { numRuns: 100 },
    );
  });
});
