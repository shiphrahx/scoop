// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The "plan my day" wizard: pick a carb, a protein, a fat, then build. This is
// the meal-creation flow, and the thing it hands to the planner (the picks) is
// what decides the food the user is told to eat. A pick that silently doesn't
// stick, or a "suggest for me" that quietly becomes a real choice, changes the
// day's food without the user ever seeing it happen.

const planMyDay = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/plan/day/actions", () => ({
  planMyDay: (...args: unknown[]) => planMyDay(...args),
}));
// The scanner reaches for a camera, which jsdom hasn't got.
vi.mock("@/components/BarcodeScanner", () => ({
  default: () => null,
}));

const BuildWizard = (await import("@/app/(app)/plan/day/build/BuildWizard")).default;

const pantry = {
  carbs: ["Basmati Rice", "Rolled Oats"],
  proteins: ["Chicken Breast", "Firm Tofu"],
  fats: ["Olive Oil"],
};

beforeEach(() => {
  planMyDay.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});
afterEach(cleanup);

// Walk the wizard the way a user does: on each of the three steps either tap a
// food chip and then Next, or tap "Suggest one" to leave it to the app.
async function runWizard(
  user: ReturnType<typeof userEvent.setup>,
  choices: { carb?: string; protein?: string; fat?: string },
) {
  for (const macro of ["carb", "protein", "fat"] as const) {
    const pick = choices[macro];
    if (pick) {
      await user.click(screen.getByRole("button", { name: new RegExp(`^${pick}$`, "i") }));
      await user.click(screen.getByRole("button", { name: /^next$/i }));
    } else {
      await user.click(screen.getByRole("button", { name: /suggest one/i }));
    }
  }
}

const buildButton = () => screen.getByRole("button", { name: /build my day/i });

describe("BuildWizard", () => {
  it("sends the foods the user picked to the planner", async () => {
    const user = userEvent.setup();
    render(<BuildWizard {...pantry} />);

    await runWizard(user, {
      carb: "Basmati Rice",
      protein: "Firm Tofu",
      fat: "Olive Oil",
    });
    await user.click(buildButton());

    expect(planMyDay).toHaveBeenCalledTimes(1);
    expect(planMyDay).toHaveBeenCalledWith({
      carb: "Basmati Rice",
      protein: "Firm Tofu",
      fat: "Olive Oil",
    });
  });

  it("sends null for a macro the user asked it to suggest", async () => {
    // null means "you choose" — the planner then uses the densest source. If a
    // skipped step leaked a real food in here, the user would be handed a meal
    // built around something they never picked.
    const user = userEvent.setup();
    render(<BuildWizard {...pantry} />);

    await runWizard(user, { carb: "Rolled Oats" }); // protein and fat left to suggest
    await user.click(buildButton());

    expect(planMyDay).toHaveBeenCalledWith({
      carb: "Rolled Oats",
      protein: null,
      fat: null,
    });
  });

  it("takes the user to their plan once it is built", async () => {
    const user = userEvent.setup();
    render(<BuildWizard {...pantry} />);

    await runWizard(user, {});
    await user.click(buildButton());

    expect(push).toHaveBeenCalledWith("/plan/day");
  });

  it("shows the reason when the plan cannot be built, and stays put", async () => {
    // Planning throws when onboarding is unfinished. Swallowing that would leave
    // the user tapping Build on a screen that never changes.
    planMyDay.mockRejectedValue(new Error("No macro target yet — finish onboarding."));
    const user = userEvent.setup();
    render(<BuildWizard {...pantry} />);

    await runWizard(user, {});
    await user.click(buildButton());

    expect(await screen.findByText(/finish onboarding/i)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("lets the user change a pick by going back", async () => {
    const user = userEvent.setup();
    render(<BuildWizard {...pantry} />);

    // Pick rice, move on, then think better of it and go back.
    await user.click(screen.getByRole("button", { name: /^basmati rice$/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    await user.click(screen.getByRole("button", { name: /^rolled oats$/i }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /suggest one/i })); // protein
    await user.click(screen.getByRole("button", { name: /suggest one/i })); // fat
    await user.click(buildButton());

    expect(planMyDay).toHaveBeenCalledWith(
      expect.objectContaining({ carb: "Rolled Oats" }),
    );
  });

  it("still works when the pantry has nothing of a given macro", async () => {
    // An empty pool must not strand the user on a screen with no way forward.
    const user = userEvent.setup();
    render(<BuildWizard carbs={["Basmati Rice"]} proteins={[]} fats={[]} />);

    await runWizard(user, { carb: "Basmati Rice" });
    await user.click(buildButton());

    expect(planMyDay).toHaveBeenCalledWith({
      carb: "Basmati Rice",
      protein: null,
      fat: null,
    });
  });
});
