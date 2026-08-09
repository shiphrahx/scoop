import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signs the user out and sends them back to the public landing page.
export async function POST(request: Request) {
  const supabase = await createClient();
  // Local scope signs out this browser only. The default is global, which
  // revokes every refresh token the account has, signing out on the laptop
  // would drop the phone and the tablet too, and people track across all three.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
