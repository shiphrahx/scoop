import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Runs on every matched request. `updateSession` refreshes the Supabase auth
// token (Server Components can't write cookies, so without this the session
// silently expires and the user is bounced to /login mid-use — slow and
// jarring) and redirects unauthenticated requests away from private routes.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Match every path except Next's build assets, the icons, and the service
  // worker / favicon — auth refresh has no business running on those, and it
  // would only add latency to each asset fetch.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)",
  ],
};
