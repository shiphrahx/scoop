import "server-only";
import { cookies } from "next/headers";
import { NARROW, VIEWPORT_COOKIE } from "@/lib/viewport";

// True unless the browser has told us it is narrow. Never false on a first
// visit: the cost of guessing wrong towards "wide" is some unused data, and the
// cost of guessing wrong towards "narrow" is an empty desktop dashboard — so
// the absent-cookie case reads as wide and the client corrects it from there.
export async function isProbablyWide(): Promise<boolean> {
  const store = await cookies();
  return store.get(VIEWPORT_COOKIE)?.value !== NARROW;
}
