import { NextResponse, type NextRequest } from "next/server";
import { searchProducts } from "@/lib/off";

// GET /api/off/search?q=<name> — ranked Open Food Facts candidates for an
// imported item name (#6). Keeps the OFF User-Agent and caching on the server.
// Never needs a user key. Ranking lives in searchProducts so this stays a proxy.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ candidates: [] });
  return NextResponse.json({ candidates: await searchProducts(q) });
}
