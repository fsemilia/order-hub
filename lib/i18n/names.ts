import type { Dictionary } from "./index";

/** Display name of a customer, with translated placeholders for redacted / nameless customers. */
export function displayName(c: { name: string | null; redacted: boolean }, dict: Dictionary) {
  if (c.redacted) return dict.common.redactedCustomer;
  return c.name ?? dict.common.noName;
}

export function orderStatusLabel(status: string, cancelled: boolean, dict: Dictionary) {
  if (cancelled) return dict.orderStatus.cancelled ?? "cancelled";
  return dict.orderStatus[status] ?? status;
}
