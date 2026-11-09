import { z } from "zod";

// Zod schemas for the subset of Shopify webhook payloads we use (REST webhook format).
// Unknown fields are stripped: we never trust or store the raw payload wholesale.
// Reference: https://shopify.dev/docs/api/webhooks (topics orders/*, customers/*)

const shopifyId = z.union([z.number(), z.string()]).transform(String);
const money = z.string().regex(/^-?\d+(\.\d+)?$/, "expected a decimal string");
const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export const shopifyCustomerSchema = z.object({
  id: shopifyId,
  email: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  phone: z.string().nullish(),
  // Newer API versions expose email_marketing_consent; accepts_marketing is the legacy flag.
  email_marketing_consent: z.object({ state: z.string().nullish() }).nullish(),
  accepts_marketing: z.boolean().nullish(),
});

export const shopifyLineItemSchema = z.object({
  id: shopifyId,
  title: z.string(),
  sku: z.string().nullish(),
  quantity: z.number().int(),
  price: money,
});

export const shopifyOrderSchema = z.object({
  id: shopifyId,
  name: z.string(),
  total_price: money,
  // Reflects refunds and order edits; absent in some older payloads
  current_total_price: money.nullish(),
  currency: z.string().length(3),
  financial_status: z.string().nullish(),
  fulfillment_status: z.string().nullish(),
  created_at: isoDate,
  updated_at: isoDate,
  cancelled_at: isoDate.nullish(),
  customer: shopifyCustomerSchema.nullish(),
  line_items: z.array(shopifyLineItemSchema).default([]),
});

export const customersRedactSchema = z.object({
  shop_domain: z.string(),
  customer: z.object({ id: shopifyId, email: z.string().nullish() }),
});

export type ShopifyOrder = z.infer<typeof shopifyOrderSchema>;
export type ShopifyCustomer = z.infer<typeof shopifyCustomerSchema>;

export function acceptsMarketing(c: ShopifyCustomer): boolean {
  if (c.email_marketing_consent?.state) return c.email_marketing_consent.state === "subscribed";
  return c.accepts_marketing ?? false;
}
