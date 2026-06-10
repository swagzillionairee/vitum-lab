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

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
