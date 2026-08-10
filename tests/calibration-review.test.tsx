// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalibrationWrap } from "@/lib/calibrationwrap";

// The review is the one screen a user sees between calibration and their first
// deficit. It has to say what was measured, what the new target is, and start
// nothing until they press the button.

const startDeficit = vi.fn();
vi.mock("@/app/calibration/actions", () => ({
  startDeficit: (...args: unknown[]) => startDeficit(...args),
}));

const reviewModule = await import("@/app/calibration/CalibrationReview");
const CalibrationReview = reviewModule.default;
const { buildCards } = reviewModule;

const wrap = (over: Partial<CalibrationWrap> = {}): CalibrationWrap => ({
  days: 14,
  loggedDays: 13,
  weighInDays: 12,
  measuredMaintenanceKcal: 2400,
  predictedMaintenanceKcal: 2200,
  maintenanceDeltaKcal: 200,
  activeShare: 0.375,
  meanStepsPerDay: 9000,
  meanSleepHours: 7,
  meanIntakeKcal: 2400,
  measurementDoubt: null,
  holdTargetKcal: 2400,
  adherentDays: 12,
  weightChangeKg: 0.1,
  newTarget: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
  deficitKcal: 400,
  changeFromHoldKcal: 400,
  holdLossKgPerWeek: 0.1,
  expectedLossKgPerWeek: 0.36,
  inHealthyBand: true,
  projection: {
    points: [
      { week: 0, kg: 80 },
      { week: 1, kg: 79.6 },
      { week: 2, kg: 79.3 },
    ],
    goalWeeks: 16,
    goalDate: "2026-11-29",
  },
  ...over,
});

// Walk to the last card, whatever the findings added up to.
async function toEnd(user: ReturnType<typeof userEvent.setup>) {
  // Generous: the deck grows a card for every finding the fortnight supports,
  // and a user with a watch and a full food log sees roughly twice the minimum.
  for (let i = 0; i < 30; i++) {
    const next = screen.queryByRole("button", { name: /next/i });
    if (!next) break;
    await user.click(next);
  }
}

beforeEach(() => startDeficit.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);

describe("calibration review", () => {
  it("opens on what the fortnight was, not on the new target", async () => {
    render(<CalibrationReview wrap={wrap()} name="Sam" />);
    expect(screen.getByText(/Sam, calibration is complete/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "14" })).toBeTruthy();
    expect(screen.getByText(/logged your food on 13 of them/i)).toBeTruthy();
    // The general point is in its own labelled block, not mixed into the above.
    expect(screen.getByText(/^Why this works:/)).toBeTruthy();
  });

  it("shows the measured burn against the formula's guess", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByRole("heading", { name: "2,400" })).toBeTruthy();
    expect(screen.getByText(/200 kcal a day warmer than that/i)).toBeTruthy();
  });

  it("states the new target with its macros and the cut behind it", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);
    // The target card is two back from the end (target → expect → start).
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("heading", { name: "2,000" })).toBeTruthy();
    expect(screen.getByText(/Protein 150 g/)).toBeTruthy();
    // Both numbers, because the reader can do the subtraction either way.
    expect(screen.getByText(/400 kcal below the 2,400 kcal you burn/i)).toBeTruthy();
    expect(screen.getByText(/400 kcal less food than the 2,400 you're used to/i)).toBeTruthy();
  });

  it("names the cut against the burn AND against what was being eaten", async () => {
    const user = userEvent.setup();
    // The case that read as broken arithmetic: held at 1,700, burns 1,609,
    // now eating 1,378, a 231 kcal deficit but 322 kcal less food.
    render(
      <CalibrationReview
        wrap={wrap({
          holdTargetKcal: 1700,
          measuredMaintenanceKcal: 1609,
          newTarget: { kcal: 1378, protein_g: 130, carbs_g: 130, fat_g: 43 },
          deficitKcal: 231,
          changeFromHoldKcal: 322,
        })}
        name={null}
      />,
    );
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText(/231 kcal below the 1,609 kcal you burn/i)).toBeTruthy();
    expect(screen.getByText(/322 kcal less food than the 1,700/i)).toBeTruthy();
  });

  // The fortnight where the food log came to far less than the target. Nothing
  // here may be presented as a measurement of the user's body, and the target it
  // set did not move.
  const shortLog = () =>
    wrap({
      measuredMaintenanceKcal: null,
      predictedMaintenanceKcal: null,
      maintenanceDeltaKcal: null,
      activeShare: null,
      measurementDoubt: "intake_shortfall",
      meanIntakeKcal: 898,
      holdTargetKcal: 1720,
      newTarget: { kcal: 1720, protein_g: 130, carbs_g: 170, fat_g: 55 },
      deficitKcal: null,
      changeFromHoldKcal: 0,
      weightChangeKg: 1.16,
      holdLossKgPerWeek: 0.54,
      expectedLossKgPerWeek: 0.54,
    });

  it("never claims the user ate a number it only asked them to eat", async () => {
    render(<CalibrationReview wrap={shortLog()} name="Sam" />);
    // The contradiction this screen used to open with: "you ate 1,720" here and
    // "you ate 898" three cards later, both off the same fortnight.
    expect(screen.getByText(/your target was 1,720 kcal a day/i)).toBeTruthy();
    expect(screen.getByText(/food log came to 898 kcal a day, well under that/i)).toBeTruthy();
    expect(screen.queryByText(/you ate 1,720/i)).toBeNull();
  });

  it("says why there is no burn figure instead of going quiet", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={shortLog()} name={null} />);
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByText(/why there's no burn figure/i)).toBeTruthy();
    expect(screen.getByText(/can't be used to measure your body/i)).toBeTruthy();
  });

  it("explains a target that was held rather than cut", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={shortLog()} name={null} />);
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("heading", { name: "1,720" })).toBeTruthy();
    expect(screen.getByText(/the same amount of food you're already used to/i)).toBeTruthy();
    expect(screen.getByText(/not being cut/i)).toBeTruthy();
    // And no deficit against a burn the screen has just said it cannot measure.
    expect(screen.queryByText(/kcal below the/i)).toBeNull();
  });

  it("promises the rate the fortnight already showed, not a slower one", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={shortLog()} name={null} />);
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("heading", { name: "0.54" })).toBeTruthy();
    expect(screen.getByText(/not a forecast/i)).toBeTruthy();
    expect(screen.queryByText(/on more food than this/i)).toBeNull();
  });

  it("predicts the weekly loss and when the goal is reached", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("heading", { name: "0.36" })).toBeTruthy();
    expect(screen.getByText(/29 November 2026/)).toBeTruthy();
    expect(screen.getByText(/goal weight is about 16 weeks away/i)).toBeTruthy();
    // Checkable against the rate they were already losing at, on more food.
    expect(screen.getByText(/already losing about 0.10 kg a week/i)).toBeTruthy();
    // The curve is drawn, and says what it is for a screen reader.
    expect(screen.getByRole("img", { name: /projected weight/i })).toBeTruthy();
  });

  it("changes nothing until the user starts it", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);

    expect(startDeficit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /start now/i }));
    expect(startDeficit).toHaveBeenCalledTimes(1);
  });

  it("drops the findings it has no data for, and still reaches the target", async () => {
    const user = userEvent.setup();
    render(
      <CalibrationReview
        wrap={wrap({
          measuredMaintenanceKcal: null,
          maintenanceDeltaKcal: null,
          predictedMaintenanceKcal: null,
          activeShare: null,
          meanStepsPerDay: null,
          meanSleepHours: null,
          weightChangeKg: null,
          expectedLossKgPerWeek: null,
          projection: null,
        })}
        name={null}
      />,
    );
    await toEnd(user);

    // Only "the fortnight", "your target" and "start" survive, and the last one
    // is still the button, because the plan must always be reachable.
    expect(screen.getByRole("button", { name: /start now/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("heading", { name: "2,000" })).toBeTruthy();
  });

  it("replays a filed review with nothing left to start", async () => {
    const user = userEvent.setup();
    render(
      <CalibrationReview
        wrap={wrap()}
        name="Sam"
        replay
        endedAt="2026-08-09T09:00:00.000Z"
      />,
    );

    // Dated, and addressed to the past rather than to a decision.
    expect(screen.getByText(/Calibration review · 9 August 2026/)).toBeTruthy();
    await toEnd(user);

    expect(screen.queryByRole("button", { name: /start now/i })).toBeNull();
    expect(screen.getByRole("link", { name: /done/i })).toBeTruthy();
    expect(startDeficit).not.toHaveBeenCalled();
  });

  it("says so when starting the deficit fails, and does not pretend it worked", async () => {
    // Once, and as an explicit rejection: a persistent async-throwing mock
    // leaves a rejected promise behind between tests that vitest reports as an
    // unhandled error even though the component handles it.
    startDeficit.mockImplementationOnce(() => Promise.reject(new Error("Network is down.")));
    const user = userEvent.setup();
    render(<CalibrationReview wrap={wrap()} name={null} />);
    await toEnd(user);
    await user.click(screen.getByRole("button", { name: /start now/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("Network is down.");
    // Still on the last card, with the button to try again.
    expect(screen.getByRole("button", { name: /start now/i })).toBeTruthy();
  });
});

// The fortnight the user recognises: distance, sleep, what they ate most, how
// they logged it. Read off buildCards rather than the rendered deck, because
// what matters here is which findings exist and what each one claims, not which
// tap they land on.
describe("calibration review, the fortnight itself", () => {
  const stats = (over: Partial<CalibrationWrap> = {}): CalibrationWrap =>
    wrap({
      movement: {
        days: 14,
        totalSteps: 126000,
        distanceKm: 85.86,
        meanStepsPerDay: 9000,
        bestDay: { date: "2026-08-01", steps: 15000 },
        medianSteps: 9000,
        streakDays: 5,
        workoutKcal: 2800,
      },
      sleep: {
        nights: 14,
        totalHours: 98,
        meanHours: 7,
        bestNight: { date: "2026-08-02", hours: 9.2 },
      },
      plate: {
        logs: 28,
        distinctFoods: 6,
        totalGrams: 11200,
        weighedLogs: 26,
        totalProteinG: 2100,
        topFood: { name: "Porridge", count: 12, meanKcal: 400 },
        alcoholKcal: 360,
      },
      habits: {
        logs: 28,
        longestLogStreak: 13,
        longestOnTargetStreak: 9,
        lastLogHour: 20,
        busiestHour: 8,
        oneTapLogs: 21,
      },
      energy: {
        totalBurnKcal: 33600,
        totalIntakeKcal: 33000,
        fromStorageKcal: 6930,
        basis: "burn",
        basisKcal: 33600,
        equivalents: [
          { key: "food", count: 84, unit: "servings of Porridge" },
          { key: "walk", count: 840, unit: "km of walking" },
          { key: "boil", count: 420, unit: "litres of water boiled" },
        ],
      },
      ...over,
    });

  const card = (w: CalibrationWrap, key: string) =>
    buildCards(w, null).find((c) => c.key === key);

  it("puts the fortnight's burn beside things a person can picture", () => {
    const c = card(stats(), "energy")!;
    expect(c.value).toBe("33,600");
    expect(c.unit).toMatch(/kcal burned in 14 days/);
    expect(c.body).toMatch(/84 servings of Porridge/);
    expect(c.body).toMatch(/enough to walk 840 km/);
    expect(c.body).toMatch(/420 litres of water boiled/);
    // The weight lost, priced in the energy it took to shift.
    expect(c.body).toMatch(/6,930 kcal came out of storage/);
  });

  it("compares energy without putting a brand on the screen", () => {
    const text = buildCards(stats(), null)
      .map((c) => `${c.kicker} ${c.value} ${c.unit ?? ""} ${c.body} ${c.note ?? ""}`)
      .join(" ");
    expect(text).not.toMatch(/big mac|mcdonald|burger king|starbucks|coca.?cola/i);
  });

  it("names the food logged, not a guess, when there was no burn to total", () => {
    const c = card(
      stats({
        energy: {
          totalBurnKcal: null,
          totalIntakeKcal: 25000,
          fromStorageKcal: null,
          basis: "intake",
          basisKcal: 25000,
          equivalents: [{ key: "boil", count: 313, unit: "litres of water boiled" }],
        },
      }),
      "energy",
    )!;
    expect(c.unit).toMatch(/kcal of food in 14 days/);
    expect(c.body).not.toMatch(/storage/);
  });

  it("turns the steps into a distance, with the best day and the best run", () => {
    const c = card(stats(), "movement")!;
    expect(c.value).toBe("86");
    expect(c.unit).toBe("km walked");
    expect(c.body).toMatch(/126,000 steps over 14 days/);
    expect(c.body).toMatch(/busiest day was 15,000 steps/);
    expect(c.body).toMatch(/longest run at or above your usual 9,000 steps was 5 days/);
    expect(c.body).toMatch(/Workouts added 2,800 kcal/);
  });

  it("totals the sleep it was given", () => {
    const c = card(stats(), "sleep")!;
    expect(c.value).toBe("98");
    expect(c.body).toMatch(/averages 7.0 hours/);
    expect(c.body).toMatch(/longest was 9.2 hours/);
  });

  it("names the food they ate most and what went through them", () => {
    const c = card(stats(), "plate")!;
    expect(c.value).toBe("12");
    expect(c.unit).toBe("servings of Porridge");
    expect(c.body).toMatch(/28 entries across 6 different foods/);
    expect(c.body).toMatch(/11.2 kg of food/);
    expect(c.body).toMatch(/2,100 g of protein/);
    expect(c.body).toMatch(/Drinks accounted for 360 kcal/);
  });

  it("counts the streak, the clock and the tapping", () => {
    const c = card(stats(), "habits")!;
    expect(c.value).toBe("13");
    expect(c.unit).toBe("days in a row");
    expect(c.body).toMatch(/best run of days landing on the target was 9/);
    expect(c.body).toMatch(/around 20:00/);
    expect(c.body).toMatch(/21 of 28 entries came from a scan/);
  });

  it("drops every card whose data never arrived", () => {
    // A user with no wearable and a review filed before these findings existed.
    const keys = buildCards(wrap(), null).map((c) => c.key);
    expect(keys).not.toContain("movement");
    expect(keys).not.toContain("sleep");
    expect(keys).not.toContain("plate");
    expect(keys).not.toContain("habits");
    expect(keys).not.toContain("energy");
    // The findings the target depends on are all still there.
    expect(keys).toContain("target");
    expect(keys).toContain("start");
  });

  it("still ends on the button that starts the deficit", async () => {
    const user = userEvent.setup();
    render(<CalibrationReview wrap={stats()} name="Sam" />);
    await toEnd(user);
    expect(screen.getByRole("button", { name: /start now/i })).toBeTruthy();
    expect(startDeficit).not.toHaveBeenCalled();
  });
});
