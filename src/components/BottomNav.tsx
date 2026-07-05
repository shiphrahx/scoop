"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/plan", label: "Plan", icon: "🍽️" },
  { href: "/add", label: "Add", icon: "➕", center: true },
  { href: "/progress", label: "Progress", icon: "📈" },
  { href: "/me", label: "Me", icon: "🙂" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {items.map((item) => {
          const active = pathname === item.href;

          if ("center" in item && item.center) {
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex h-16 w-16 -translate-y-4 items-center justify-center rounded-full bg-green-500 text-3xl text-white shadow-[0_5px_0_0_#15803d] transition active:translate-y-[-14px] active:shadow-[0_0_0_0_#15803d]"
                >
                  {item.icon}
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs font-extrabold transition ${
                  active
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "text-[var(--muted)]"
                }`}
              >
                <span className="text-2xl">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
