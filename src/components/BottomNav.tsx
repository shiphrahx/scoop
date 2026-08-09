"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { bottomNav } from "@/components/nav-items";
import LinkHint from "@/components/LinkHint";

// Mobile-only tab bar. Hidden on desktop, where the sidebar takes over.
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-white/90 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {bottomNav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          // The raised centre tab. Its label is rendered, not just announced,
          // an unlabelled icon here is a guess, and the whole point of the tab
          // is that you can tell where it goes without tapping it. The circle
          // keeps the lift; the caption sits under it in line with its siblings.
          if (item.center) {
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="relative flex w-16 -translate-y-4 flex-col items-center gap-1 text-xs font-medium"
                  style={{ color: active ? "var(--ink-teal)" : "var(--muted)" }}
                >
                  <span className="sc-btn-primary flex h-16 w-16 items-center justify-center rounded-full">
                    <Icon size={28} strokeWidth={2.5} />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                  <LinkHint />
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="relative flex w-16 flex-col items-center gap-1 rounded-2xl py-1.5 text-xs font-medium transition"
                style={{ color: active ? "var(--ink-teal)" : "var(--muted)" }}
              >
                <Icon size={24} strokeWidth={active ? 2.5 : 2} />
                {item.label}
                <LinkHint />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
