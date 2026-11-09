import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the X-Shopify-Hmac-Sha256 header of a webhook.
 *
 * - `rawBody` must be the body exactly as received (`await req.text()`),
 *   NOT `JSON.stringify(await req.json())`: re-serializing changes the bytes and breaks the HMAC.
 * - Constant-time comparison (`timingSafeEqual`), never `===`, to avoid timing attacks.
 */
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(hmacHeader, "utf8");
  // timingSafeEqual throws if lengths differ
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Used by tests and by scripts/send-test-webhook.ts to sign payloads like Shopify does. */
export function signShopifyPayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}
