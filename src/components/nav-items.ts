import {
  Home,
  Plus,
  LineChart,
  User,
  Package,
  CookingPot,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  center?: boolean;
};

// Bottom nav (mobile) — five thumb-reachable tabs with "Log" (the day plan,
// where food is scanned and logged per meal) as the raised centre button. Two
// tabs sit either side of it so the "+" lands dead centre: Home + Coach left,
// Progress + Me right.
export const bottomNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/plan/day", label: "Log", icon: Plus, center: true },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/me", label: "Me", icon: User },
];

// Sidebar (desktop) — the full map, since there's room to breathe.
export const sidebarNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/plan/day", label: "Log food", icon: Plus },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/batches", label: "Batches", icon: CookingPot },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/me", label: "Me", icon: User },
];
