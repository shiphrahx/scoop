"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sidebarNav } from "@/components/nav-items";

// Desktop-only sidebar. Hidden below lg, where the bottom nav takes over.
export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-2 p-5 lg:flex">
      <Link href="/" className="mb-4 flex items-center gap-2.5 px-2">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl text-white"
          style={{ background: "var(--grad-primary)" }}
        >
          <span className="text-lg font-bold">S</span>
        </span>
        <span className="text-xl font-semibold tracking-tight">Scoop</span>
      </Link>

      <nav>
        <ul className="flex flex-col gap-1">
          {sidebarNav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition ${
                    active
                      ? "sc-card-solid font-semibold"
                      : "font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.5 : 2}
                    color={active ? "#0f766e" : "currentColor"}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
