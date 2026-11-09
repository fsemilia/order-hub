import { NextResponse, type NextRequest } from "next/server";
import { handleShopifyWebhook } from "@/lib/shopify/webhooks";

// Shopify expects a response within 5 seconds; the work here is a single short transaction.
// At higher volume, acknowledge first and process from a queue (see docs/adr/0003).
export async function POST(req: NextRequest) {
  // Raw body BEFORE any parsing: the HMAC is computed over the exact bytes.
  const raw = await req.text();
  const { status, body } = await handleShopifyWebhook(raw, req.headers);
  return NextResponse.json(body, { status });
}
