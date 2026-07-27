import { Suspense } from "react";
import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";

// Streamed gate. Middleware already bounces a signed-out user to /login before
// any (app) route renders, so the checks here are a second guard plus the one
// thing middleware can't do without a DB read: sending users who haven't
// finished onboarding to /onboarding. Kept out of the layout body so it doesn't
// hold up the chrome — see below.
async function SessionGate() {
  // Both cached for the request, so the page rendering alongside shares these
  // round trips rather than repeating them.
  const [user, profile] = await Promise.all([getSessionUser(), getProfile()]);
  if (!user) redirect("/login");
  if (!profile?.onboarded_at) redirect("/onboarding");
  return null;
}

// Shared shell for every signed-in screen: content area + bottom nav.
//
// The chrome (sidebar, bottom nav, the column wrapper) reads nothing per-user,
// so it prerenders as a static shell and paints the instant the route is hit —
// the nav and the page's own loading skeleton show immediately instead of
// waiting on a Supabase round trip. The auth/onboarding gate is the one dynamic
// part, so it streams behind its own Suspense boundary.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 lg:gap-2 lg:px-4">
      <Sidebar />
      {/* Mobile keeps the phone-width column; desktop lets content go wide. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col lg:max-w-none">
          <Suspense fallback={null}>
            <SessionGate />
          </Suspense>
          {children}
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
