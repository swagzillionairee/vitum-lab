/*
 * discounts.ts — client mirror of the server's quantity-tier logic
 * (api/_lib/pricing.ts → quantityDiscountPercent) for the checkout display only.
 * The server recomputes every discount authoritatively at order creation.
 */
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

// EPSILON nudge before rounding — keep identical to api/_lib/pricing.ts round2.
export const round2 = (n: number): number => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

export const SHIPPING_FEE = 15;
export const FREE_SHIPPING_THRESHOLD = 100;

/**
 * Flat $15 shipping under the free-shipping threshold, free at $100+ —
 * mirror of api/_lib/pricing.ts → shippingFee. Based on the pre-discount
 * item subtotal (same basis as the free BAC Water gift).
 */
export function shippingFee(subtotal: number): number {
  return (Number(subtotal) || 0) >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}
