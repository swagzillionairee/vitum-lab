import { customAlphabet } from "nanoid";

// Order numbers are a plain 20-digit random string, stored as the orders PK.
// 10^20 keyspace — collisions are astronomically unlikely at this store's scale.
const genOrderDigits = customAlphabet("0123456789", 20);

/** A fresh order number: 20 random digits. */
export function buildOrderId(): string {
  return genOrderDigits();
}

/**
 * Display form of an order number. New IDs are already a clean 20-digit string
 * (returned as-is). Legacy IDs were "{id}--{base64url(email)}", so only the part
 * before the separator is shown.
 */
export function formatOrderId(id: string): string {
  const raw = String(id ?? "");
  const i = raw.indexOf("--");
  return i === -1 ? raw : raw.slice(0, i);
}
