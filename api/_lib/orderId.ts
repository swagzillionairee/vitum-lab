import { customAlphabet } from "nanoid";

// Order numbers are 3 letters + a dash + 6 digits (e.g. "KFD-837291"), stored as
// the orders PK — short + readable enough to type into a Venmo/Cash App memo. The
// dash is part of the stored id, so what's displayed, copied, typed, and matched
// are all the exact same string. Letters exclude I/O (confusable with 1/0).
// Keyspace 24^3 × 10^6 ≈ 1.4×10^10 — a PK collision is negligible at this store's
// scale and fails the insert (never overwrites).
const genLetters = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ", 3);
const genDigits = customAlphabet("0123456789", 6);

/** A fresh order number: 3 letters + dash + 6 digits (e.g. "KFD-837291"). */
export function buildOrderId(): string {
  return `${genLetters()}-${genDigits()}`;
}

/**
 * Display form of an order number. New IDs (letters+digits) are returned as-is.
 * Legacy IDs were "{id}--{base64url(email)}", so only the part before the
 * separator is shown; plain 20-digit legacy IDs also pass through unchanged.
 */
export function formatOrderId(id: string): string {
  const raw = String(id ?? "");
  const i = raw.indexOf("--");
  return i === -1 ? raw : raw.slice(0, i);
}
