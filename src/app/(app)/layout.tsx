import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";

// Shared shell for every signed-in screen: content area + bottom nav.
// Middleware already gates these routes; this is a second guard for safety.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both are cached for the request, so the page rendering alongside this
  // layout shares the same two round trips rather than repeating them.
  const [user, profile] = await Promise.all([getSessionUser(), getProfile()]);

  if (!user) {
    redirect("/login");
  }

  // New users must finish onboarding before reaching the app.
  if (!profile?.onboarded_at) {
    redirect("/onboarding");
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 lg:gap-2 lg:px-4">
      <Sidebar />
      {/* Mobile keeps the phone-width column; desktop lets content go wide. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col lg:max-w-none">
          {children}
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
