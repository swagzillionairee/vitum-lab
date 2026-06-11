/*
 * orders.ts — client mirror of api/_lib/orderId.ts → formatOrderId, for display.
 * New order numbers are a plain 20-digit string; legacy IDs were
 * "{id}--{base64url(email)}", so only the part before the separator is shown.
 */
export function formatOrderId(id: string): string {
  const raw = String(id ?? "");
  const i = raw.indexOf("--");
  return i === -1 ? raw : raw.slice(0, i);
}
