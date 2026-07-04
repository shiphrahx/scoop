import { redirect } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import { createClient } from "@/lib/supabase/server";

// Shared shell for every signed-in screen: content area + bottom nav.
// Middleware already gates these routes; this is a second guard for safety.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <BottomNav />
    </div>
  );
}
