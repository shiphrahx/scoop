import { NextResponse } from "next/server";
import { lookupBarcode } from "@/lib/off";

// GET /api/off/<barcode> — the barcode scanner calls this after a successful
// scan to turn a number into a name + macros.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await ctx.params;

  const product = await lookupBarcode(barcode);
  if (!product) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(product);
}
