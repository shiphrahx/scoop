import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signs the user out and sends them back to the public landing page.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
