// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bottomNav } from "@/components/nav-items";

// next/link and the router hooks, reduced to what the bar actually needs.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/LinkHint", () => ({ default: () => null }));

const { default: BottomNav } = await import("@/components/BottomNav");

afterEach(cleanup);

// The mobile bar is the only way around the app on a phone, so every tab has to
// say where it goes. The centre one used to be a bare "+" with its label only in
// aria-label — an icon that could equally have meant "add a pantry item".
describe("BottomNav", () => {
  it("gives every tab a visible label, including the raised centre one", () => {
    render(<BottomNav />);

    for (const item of bottomNav) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link.getAttribute("href")).toBe(item.href);
      // Visible text, not just an accessible name borrowed from aria-label.
      expect(link.textContent).toContain(item.label);
    }
  });

  it("points the centre tab at the day plan", () => {
    const centre = bottomNav.find((i) => i.center);
    expect(centre).toBeDefined();
    expect(centre!.href).toBe("/plan/day");
    // Whatever the wording, it has to name the destination rather than an action.
    expect(centre!.label.toLowerCase()).toContain("day");
  });
});
