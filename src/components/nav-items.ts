import {
  Home,
  Plus,
  LineChart,
  User,
  Package,
  CookingPot,
  Sparkles,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  center?: boolean;
};

// Bottom nav (mobile) — five thumb-reachable tabs with the day plan as the
// raised centre button. Two tabs sit either side of it so it lands dead centre:
// Home + Coach left, Progress + Me right.
//
// The centre used to be a bare "+", which reads as "add something" and gave no
// clue it opens the day's plan — it could as easily have meant a new pantry
// item. A calendar and the word for where it goes say which.
export const bottomNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/plan/day", label: "Day plan", icon: CalendarCheck, center: true },
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
