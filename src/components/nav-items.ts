import {
  Home,
  Plus,
  LineChart,
  User,
  Package,
  Sparkles,
  CalendarCheck,
  Star,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  center?: boolean;
};

// Bottom nav (mobile), five thumb-reachable tabs with the day plan as the
// raised centre button. Two tabs sit either side of it so it lands dead centre:
// Home + Coach left, Progress + Me right.
//
// The centre used to be a bare "+", which reads as "add something" and gave no
// clue it opens the day's plan, it could as easily have meant a new pantry
// item. A calendar and the word for where it goes say which.
export const bottomNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/plan/day", label: "Day plan", icon: CalendarCheck, center: true },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/me", label: "Me", icon: User },
];

// Sidebar (desktop), the full map, since there's room to breathe.
//
// Favourites and Recipes are listed in their own right. They used to hang off a
// /plan hub that existed only to link to them, which put a screen between the
// user and the thing they wanted; the hub is gone.
//
// Batches is deliberately absent: the feature is built and the route still
// works, but it isn't in use yet, so it doesn't earn a permanent line here. Put
// it back when it does, nothing else needs changing.
export const sidebarNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/plan/day", label: "Log food", icon: Plus },
  { href: "/plan/favourites", label: "Favourites", icon: Star },
  { href: "/plan/recipe", label: "Recipes", icon: BookOpen },
  { href: "/pantry", label: "Pantry", icon: Package },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/me", label: "Me", icon: User },
];
