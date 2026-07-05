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

// Bottom nav (mobile) — five thumb-reachable tabs, Add in the centre.
export const bottomNav: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/plan", label: "Plan", icon: ChefHat },
  { href: "/add", label: "Add", icon: Plus, center: true },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/me", label: "Me", icon: User },
];

// Sidebar (desktop) — the full map, since there's room to breathe.
export const sidebarNav: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/add", label: "Add food", icon: Plus },
  { href: "/plan", label: "Plan a meal", icon: ChefHat },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/batches", label: "Batches", icon: CookingPot },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/me", label: "Me", icon: User },
];
