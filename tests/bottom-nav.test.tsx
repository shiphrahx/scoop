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
  Reflect.deleteProperty(window, "matchMedia");
});

// jsdom has no matchMedia either. `(pointer: coarse)` is how the hook asks
// whether the keyboard is drawn on the glass or sitting on a desk.
function stubPointer(coarse: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: coarse && query.includes("coarse") }),
    configurable: true,
    writable: true,
  });
}

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

// The first go at issue 73 read the viewport and nothing else, which is why the
// bug came back: installed to the home screen, iOS runs the app standalone and
// the keyboard slides over the page without moving the visual viewport. The
// numbers say all is well while the bottom of the screen has gone. A focused
// text field is the fact that survives that.
describe("BottomNav and a focused field", () => {
  function focusOn(el: HTMLElement) {
    document.body.append(el);
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    return el;
  }

  it("stands down for a text field even when the viewport hasn't moved", () => {
    stubPointer(true);
    stubViewport(window.innerHeight);
    const field = document.createElement("input");
    render(<BottomNav />);

    focusOn(field);

    expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
    field.remove();
  });

  it("comes back when the field is left", async () => {
    stubPointer(true);
    stubViewport(window.innerHeight);
    const field = document.createElement("input");
    render(<BottomNav />);
    focusOn(field);

    await act(async () => {
      field.blur();
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    field.remove();
  });

  // A checkbox takes focus and opens nothing. Nor does a laptop's text box:
  // the keyboard there is on the desk and covers no part of the screen.
  it("ignores focus that summons no keyboard", () => {
    stubPointer(true);
    stubViewport(window.innerHeight);
    const box = document.createElement("input");
    box.type = "checkbox";
    render(<BottomNav />);

    focusOn(box);

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    box.remove();
  });

  it("ignores focus on a device with a real keyboard", () => {
    stubPointer(false);
    stubViewport(window.innerHeight);
    const field = document.createElement("input");
    render(<BottomNav />);

    focusOn(field);

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    field.remove();
  });
});
