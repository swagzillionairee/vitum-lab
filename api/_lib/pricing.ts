/*
 * pricing.ts — pure order math + promo validation (no I/O), so it's
 * unit-testable. The checkout endpoint recomputes every discount/commission
 * amount here from the code itself; client-sent amounts are ignored.
 */

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Sum of price × quantity across line items, rounded to cents. */
export function grossFromItems(items: { price: number; quantity: number }[]): number {
  return round2(items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0));
}

/** Dollar value of a percentage discount on a subtotal. */
export function discountAmount(gross: number, percent: number): number {
  return round2((gross * percent) / 100);
}

/** Subtotal minus the discount (never trusts client math). */
export function netAmount(gross: number, discount: number): number {
  return round2(gross - discount);
}

/** Affiliate commission as a percentage of the net (post-discount) amount. */
export function commissionAmount(net: number, commissionPercent: number): number {
  return round2((net * commissionPercent) / 100);
}

/** A $0 (or negative) net means the order is free — skip NowPayments entirely. */
export function isFreeOrder(net: number): boolean {
  return net <= 0;
}

/**
 * Store credit applied to an order: never more than the balance or the amount
 * owed. Returns the credit used and the remaining cash amount due.
 */
export function applyCredit(net: number, balance: number): { creditApplied: number; amountDue: number } {
  const owed = round2(net);
  const creditApplied = round2(Math.max(0, Math.min(Number(balance) || 0, owed)));
  return { creditApplied, amountDue: round2(owed - creditApplied) };
}

/**
 * Per-unit price after a site-wide sale of `percentOff` is applied to `base`,
 * rounded UP to the nearest whole dollar (so the storefront shows clean prices
 * like $104 instead of $103.20). Used by /api/products to project the active
 * site-wide sale onto every variant. Never returns more than the base price.
 */
export function sitewideSalePrice(base: number, percentOff: number): number {
  const pct = Math.max(0, Math.min(100, Number(percentOff) || 0));
  return Math.ceil((Number(base) || 0) * (1 - pct / 100));
}

/**
 * Whether `email` has already redeemed promo `code` on a prior (paid) order —
 * promo codes are limited to one use per customer (affiliate codes are exempt
 * and never passed here). Comparison is case-insensitive on both fields.
 */
export function promoAlreadyRedeemed(
  priorOrders: { email?: string | null; discount_code?: string | null }[],
  email: string,
  code: string,
): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const c = (code ?? "").trim().toUpperCase();
  if (!e || !c) return false;
  return priorOrders.some(
    (o) => (o.email ?? "").trim().toLowerCase() === e && (o.discount_code ?? "").trim().toUpperCase() === c,
  );
}

export interface PromoRecord {
  is_active?: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  used_count?: number | null;
  min_subtotal?: number | null;
}

/**
 * Whether a promo code may be applied to an order with `gross` subtotal:
 * active, within its scheduled start/end window, under its usage cap, and
 * meeting any minimum subtotal.
 */
export function isPromoUsable(promo: PromoRecord, gross: number, now: Date = new Date()): boolean {
  if (!promo.is_active) return false;
  if (promo.starts_at && new Date(promo.starts_at) > now) return false;
  if (promo.expires_at && new Date(promo.expires_at) < now) return false;
  if (promo.max_uses != null && (Number(promo.used_count) || 0) >= promo.max_uses) return false;
  if (gross < Number(promo.min_subtotal || 0)) return false;
  return true;
}

export interface QuantityTier {
  min_qty: number;
  percent: number;
}

/** Highest tier percent whose min_qty ≤ units (0 if none qualify). */
export function quantityDiscountPercent(tiers: QuantityTier[] | null | undefined, units: number): number {
  let best = 0;
  for (const t of tiers ?? []) {
    const min = Number(t.min_qty) || 0;
    const pct = Number(t.percent) || 0;
    if (min > 0 && units >= min && pct > best) best = pct;
  }
  return best;
}

export type DiscountKind = "quantity" | "promo" | "affiliate" | "referral";
export interface DiscountLine {
  type: DiscountKind;
  label: string;
  amount: number;
}

/**
 * Stacked order discounts on a gross subtotal (which already reflects any
 * site-wide sale, baked into item prices). The quantity-tier % comes off first,
 * then a single code (promo/affiliate as a %, or referral as a flat $) comes off
 * the remainder. Returns each line for the customer-facing breakdown + the net.
 */
export function computeStackedDiscounts(opts: {
  gross: number;
  units: number;
  tiers?: QuantityTier[] | null;
  code?: { kind: "promo" | "affiliate" | "referral"; label: string; percent?: number; amount?: number } | null;
}): { lines: DiscountLine[]; totalDiscount: number; net: number; qtyPercent: number } {
  const gross = round2(opts.gross);
  const qtyPercent = quantityDiscountPercent(opts.tiers, opts.units);
  const qtyDiscount = round2((gross * qtyPercent) / 100);
  const afterQty = round2(gross - qtyDiscount);

  const lines: DiscountLine[] = [];
  if (qtyDiscount > 0) {
    lines.push({ type: "quantity", label: `Quantity discount (${qtyPercent}% off ${opts.units} items)`, amount: qtyDiscount });
  }

  let codeDiscount = 0;
  if (opts.code) {
    if (opts.code.amount != null) {
      // Flat $ off (referral) — never more than the remaining subtotal.
      codeDiscount = round2(Math.max(0, Math.min(opts.code.amount, afterQty)));
    } else if (opts.code.percent != null) {
      codeDiscount = round2((afterQty * opts.code.percent) / 100);
    }
    if (codeDiscount > 0) lines.push({ type: opts.code.kind, label: opts.code.label, amount: codeDiscount });
  }

  const totalDiscount = round2(qtyDiscount + codeDiscount);
  const net = round2(gross - totalDiscount);
  return { lines, totalDiscount, net, qtyPercent };
}

export interface SitewideSettings {
  sitewide_active?: boolean;
  sitewide_percent?: number | null;
  sitewide_starts_at?: string | null;
  sitewide_ends_at?: string | null;
}

/**
 * Whether the store-wide sale is currently in effect: toggled on, a positive
 * percentage, and within its scheduled start/end window. Used by /api/products
 * (to project sale prices) and /api/public/site (the countdown banner).
 */
export function isSitewideActive(s: SitewideSettings | null | undefined, now: Date = new Date()): boolean {
  if (!s?.sitewide_active) return false;
  if (!(Number(s.sitewide_percent) > 0)) return false;
  if (s.sitewide_starts_at && new Date(s.sitewide_starts_at) > now) return false;
  if (s.sitewide_ends_at && new Date(s.sitewide_ends_at) < now) return false;
  return true;
}
