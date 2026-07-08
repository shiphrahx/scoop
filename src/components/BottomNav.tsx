"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { bottomNav } from "@/components/nav-items";

// Mobile-only tab bar. Hidden on desktop, where the sidebar takes over.
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-white/90 backdrop-blur-xl lg:hidden">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {bottomNav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          if (item.center) {
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="sc-btn-primary flex h-16 w-16 -translate-y-4 items-center justify-center rounded-full"
                >
                  <Icon size={28} strokeWidth={2.5} />
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex w-16 flex-col items-center gap-1 rounded-2xl py-1.5 text-xs font-medium transition"
                style={{ color: active ? "var(--ink-teal)" : "var(--muted)" }}
              >
                <Icon size={24} strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
