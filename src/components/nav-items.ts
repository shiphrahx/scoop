import {
  Home,
  ChefHat,
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

// Bottom nav (mobile) — five thumb-reachable tabs, "Log" (the day plan, where
// food is scanned and logged per meal) in the centre.
export const bottomNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/plan", label: "Plan", icon: ChefHat },
  { href: "/plan/day", label: "Log", icon: Plus, center: true },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/me", label: "Me", icon: User },
];

// Sidebar (desktop) — the full map, since there's room to breathe.
export const sidebarNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/plan/day", label: "Log food", icon: Plus },
  { href: "/plan", label: "Plan a meal", icon: ChefHat },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/batches", label: "Batches", icon: CookingPot },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/me", label: "Me", icon: User },
];
