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

export interface PromoRecord {
  is_active?: boolean;
  expires_at?: string | null;
  max_uses?: number | null;
  used_count?: number | null;
  min_subtotal?: number | null;
}

/**
 * Whether a promo code may be applied to an order with `gross` subtotal:
 * active, not expired, under its usage cap, and meeting any minimum subtotal.
 */
export function isPromoUsable(promo: PromoRecord, gross: number, now: Date = new Date()): boolean {
  if (!promo.is_active) return false;
  if (promo.expires_at && new Date(promo.expires_at) < now) return false;
  if (promo.max_uses != null && (Number(promo.used_count) || 0) >= promo.max_uses) return false;
  if (gross < Number(promo.min_subtotal || 0)) return false;
  return true;
}
