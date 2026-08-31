// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bottomNav, sidebarNav } from "@/components/nav-items";

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

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "visualViewport");
});

// jsdom has no visual viewport, so stand one in. `height` is the part of the
// window still visible; the difference against window.innerHeight is what the
// keyboard has taken.
function stubViewport(height: number) {
  const listeners = new Set<() => void>();
  const viewport = {
    height,
    offsetTop: 0,
    addEventListener: (_type: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => void listeners.delete(fn),
    resizeTo(next: number) {
      viewport.height = next;
      act(() => {
        for (const fn of [...listeners]) fn();
      });
    },
  };
  Object.defineProperty(window, "visualViewport", {
    value: viewport,
    configurable: true,
    writable: true,
  });
  return viewport;
}

// The mobile bar is the only way around the app on a phone, so every tab has to
// say where it goes. The centre one used to be a bare "+" with its label only in
// aria-label, an icon that could equally have meant "add a pantry item".
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

  // Five is what fits a thumb across a phone, and exactly one of them is the
  // raised centre, the layout puts two either side of it.
  it("keeps the bar to five tabs with a single centre", () => {
    expect(bottomNav).toHaveLength(5);
    expect(bottomNav.filter((i) => i.center)).toHaveLength(1);
    expect(bottomNav[2].center).toBe(true);
  });
});

describe("sidebarNav", () => {
  // The /plan hub existed only to link to these two, which put a screen between
  // the user and what they were after. They are destinations in their own right.
  it("reaches favourites and recipes directly", () => {
    const hrefs = sidebarNav.map((i) => i.href);
    expect(hrefs).toContain("/plan/favourites");
    expect(hrefs).toContain("/plan/recipe");
  });

  // Built, routable, but not in use yet, so it doesn't hold a permanent line in
  // the menu. Delete this test when batches goes back in.
  it("leaves batches out of the menu", () => {
    expect(sidebarNav.map((i) => i.href)).not.toContain("/batches");
  });

  // The hub is gone; nothing may link to it.
  it("has no link to the removed plan hub", () => {
    for (const nav of [bottomNav, sidebarNav]) {
      expect(nav.map((i) => i.href)).not.toContain("/plan");
    }
  });
});

// Issue 73: on iOS the keyboard doesn't shrink the layout viewport, so a bar
// stuck to the bottom of it hung in the middle of the screen, over the food
// search results the user was trying to read.
describe("BottomNav and the on-screen keyboard", () => {
  it("gets out of the way while the keyboard is up", () => {
    stubViewport(window.innerHeight - 320);
    render(<BottomNav />);

    expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
  });

  it("comes back when the keyboard closes", () => {
    const viewport = stubViewport(window.innerHeight - 320);
    render(<BottomNav />);

    viewport.resizeTo(window.innerHeight);

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
  });

  // Safari trims a little off the visual viewport for its own toolbars as the
  // page scrolls. Losing the nav to that would be worse than the bug.
  it("stays put for a small trim that isn't a keyboard", () => {
    stubViewport(window.innerHeight - 60);
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
  });

  // Pinch-zoom shrinks the visual viewport too, but it slides down the page
  // rather than covering the bottom of it. What matters is the gap left
  // underneath, so the offset has to come off the sum.
  it("reads the offset, so a pinch-zoom isn't mistaken for a keyboard", () => {
    const viewport = stubViewport(window.innerHeight - 320);
    viewport.offsetTop = 320;
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
  });
});
