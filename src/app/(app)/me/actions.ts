"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

// Save the user's own Anthropic API key. It's read server-side only (never
// sent back to the browser) and powers the AI features on this account.
export async function saveApiKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed.startsWith("sk-ant-")) {
    throw new Error("That doesn't look like an Anthropic key (starts sk-ant-).");
  }
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("users")
    .update({ anthropic_api_key: trimmed, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
}

export async function clearApiKey() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("users")
    .update({ anthropic_api_key: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/me");
}
