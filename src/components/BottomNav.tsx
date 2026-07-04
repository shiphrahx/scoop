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
    <nav className="sticky bottom-0 z-10 border-t border-black/10 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-black/80">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 py-2">
        {items.map((item) => {
          const active = pathname === item.href;

          if ("center" in item && item.center) {
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex h-16 w-16 -translate-y-3 items-center justify-center rounded-full bg-green-500 text-3xl text-white shadow-lg transition active:scale-90"
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
                className={`flex w-16 flex-col items-center gap-1 rounded-xl py-1 text-xs font-semibold transition ${
                  active
                    ? "text-green-600 dark:text-green-400"
                    : "text-black/50 dark:text-white/50"
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
