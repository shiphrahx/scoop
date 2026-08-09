// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const syncFitbit = vi.fn();
vi.mock("@/app/(app)/coach/actions", () => ({
  syncFitbit: () => syncFitbit(),
  applyReview: vi.fn(),
  clearMockActivity: vi.fn(),
  generateAppleToken: vi.fn(),
  seedSampleData: vi.fn(),
}));

const { FitbitButton } = await import("@/app/(app)/coach/Controls");

beforeEach(() => syncFitbit.mockReset());
afterEach(cleanup);

const authorize = () =>
  document.querySelector('a[href="/api/fitbit/authorize"]') as HTMLAnchorElement | null;

describe("FitbitButton", () => {
  it("offers the grant when nothing is connected yet", () => {
    render(<FitbitButton connected={false} />);

    expect(authorize()).not.toBeNull();
    expect(screen.queryByRole("button", { name: /sync/i })).toBeNull();
  });

  it("syncs when connected, and says how it went", async () => {
    syncFitbit.mockResolvedValue({ ok: true, message: "Synced 7 days." });
    render(<FitbitButton connected />);

    await userEvent.click(screen.getByRole("button", { name: /sync last 7 days/i }));

    expect(screen.getByText("Synced 7 days.")).toBeTruthy();
    expect(authorize()).toBeNull();
  });

  // The bug this covers: `connected` only means a token row exists. Once the
  // provider rejected that token the UI still showed nothing but "Sync", so the
  // "connect again" advice pointed at a link that was never on screen, the user
  // was told the fix and given no way to apply it.
  it("turns into a reconnect link when the connection is dead", async () => {
    syncFitbit.mockResolvedValue({
      ok: false,
      reconnect: true,
      message: "That connection has expired. Connect again to resume syncing.",
    });
    render(<FitbitButton connected />);

    await userEvent.click(screen.getByRole("button", { name: /sync last 7 days/i }));

    const link = authorize();
    expect(link).not.toBeNull();
    expect(link!.textContent).toMatch(/connect fitbit again/i);
    // The reason stays on screen next to the way to fix it.
    expect(screen.getByText(/connection has expired/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sync/i })).toBeNull();
  });

  // A quiet week or a provider wobble is not a reason to send someone through a
  // fresh grant, the sync button has to stay put.
  it("keeps the sync button on a failure that is not a dead connection", async () => {
    syncFitbit.mockResolvedValue({
      ok: false,
      message: "No activity came back for the last 7 days.",
    });
    render(<FitbitButton connected />);

    await userEvent.click(screen.getByRole("button", { name: /sync last 7 days/i }));

    expect(authorize()).toBeNull();
    expect(screen.getByRole("button", { name: /sync last 7 days/i })).toBeTruthy();
  });
});
