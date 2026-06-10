import { describe, it, expect } from "vitest";
import {
  round2,
  grossFromItems,
  discountAmount,
  netAmount,
  commissionAmount,
  isFreeOrder,
  isPromoUsable,
  isSitewideActive,
  sitewideSalePrice,
  promoAlreadyRedeemed,
  quantityDiscountPercent,
  computeStackedDiscounts,
} from "./pricing";

describe("round2", () => {
  it("rounds to two decimal places", () => {
    expect(round2(9.999)).toBe(10);
    expect(round2(12.344)).toBe(12.34);
    expect(round2(12.346)).toBe(12.35);
  });
  it("coerces junk to 0", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(undefined as unknown as number)).toBe(0);
  });
});

describe("grossFromItems", () => {
  it("sums price × quantity", () => {
    expect(grossFromItems([{ price: 129, quantity: 1 }, { price: 12, quantity: 2 }])).toBe(153);
  });
  it("treats free items as $0", () => {
    expect(grossFromItems([{ price: 0, quantity: 1 }])).toBe(0);
  });
  it("is 0 for an empty cart", () => {
    expect(grossFromItems([])).toBe(0);
  });
});

describe("discount / net / commission", () => {
  it("applies a percentage discount", () => {
    expect(discountAmount(200, 10)).toBe(20);
    expect(netAmount(200, 20)).toBe(180);
  });

  it("a 100%-off promo nets to $0 (a free order)", () => {
    const gross = 129;
    const d = discountAmount(gross, 100); // 129
    const net = netAmount(gross, d); // 0
    expect(d).toBe(129);
    expect(net).toBe(0);
    expect(isFreeOrder(net)).toBe(true);
  });

  it("commission is a percent of the net (post-discount) amount", () => {
    // $200 order, 10% off → net 180, 10% commission → 18
    const net = netAmount(200, discountAmount(200, 10));
    expect(commissionAmount(net, 10)).toBe(18);
  });

  it("rounds discounts to cents", () => {
    expect(discountAmount(99.99, 10)).toBe(10); // 9.999 → 10.00
    expect(discountAmount(153, 15)).toBe(22.95);
  });
});

describe("isFreeOrder", () => {
  it("is true at or below $0", () => {
    expect(isFreeOrder(0)).toBe(true);
    expect(isFreeOrder(-5)).toBe(true);
  });
  it("is false above $0", () => {
    expect(isFreeOrder(0.01)).toBe(false);
    expect(isFreeOrder(129)).toBe(false);
  });
});

describe("isPromoUsable", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  const base = { is_active: true, expires_at: null, max_uses: null, used_count: 0, min_subtotal: 0 };

  it("accepts an active, unexpired, under-cap code meeting the minimum", () => {
    expect(isPromoUsable(base, 100, now)).toBe(true);
  });
  it("rejects an inactive code", () => {
    expect(isPromoUsable({ ...base, is_active: false }, 100, now)).toBe(false);
  });
  it("rejects an expired code but accepts one expiring in the future", () => {
    expect(isPromoUsable({ ...base, expires_at: "2026-06-01T00:00:00Z" }, 100, now)).toBe(false);
    expect(isPromoUsable({ ...base, expires_at: "2026-07-01T00:00:00Z" }, 100, now)).toBe(true);
  });
  it("rejects a code that has hit its usage cap", () => {
    expect(isPromoUsable({ ...base, max_uses: 5, used_count: 5 }, 100, now)).toBe(false);
    expect(isPromoUsable({ ...base, max_uses: 5, used_count: 4 }, 100, now)).toBe(true);
  });
  it("enforces the minimum subtotal", () => {
    expect(isPromoUsable({ ...base, min_subtotal: 150 }, 100, now)).toBe(false);
    expect(isPromoUsable({ ...base, min_subtotal: 150 }, 150, now)).toBe(true);
  });
  it("rejects a not-yet-started (scheduled) code", () => {
    expect(isPromoUsable({ ...base, starts_at: "2026-07-01T00:00:00Z" }, 100, now)).toBe(false);
    expect(isPromoUsable({ ...base, starts_at: "2026-06-01T00:00:00Z" }, 100, now)).toBe(true);
  });
});

describe("quantityDiscountPercent", () => {
  const tiers = [{ min_qty: 3, percent: 5 }, { min_qty: 5, percent: 10 }, { min_qty: 10, percent: 15 }];
  it("picks the highest qualifying tier", () => {
    expect(quantityDiscountPercent(tiers, 1)).toBe(0);
    expect(quantityDiscountPercent(tiers, 3)).toBe(5);
    expect(quantityDiscountPercent(tiers, 4)).toBe(5);
    expect(quantityDiscountPercent(tiers, 5)).toBe(10);
    expect(quantityDiscountPercent(tiers, 12)).toBe(15);
  });
  it("is 0 for no/empty tiers", () => {
    expect(quantityDiscountPercent(null, 99)).toBe(0);
    expect(quantityDiscountPercent([], 99)).toBe(0);
  });
});

describe("computeStackedDiscounts", () => {
  const tiers = [{ min_qty: 3, percent: 10 }];
  it("applies only the quantity tier when there's no code", () => {
    const r = computeStackedDiscounts({ gross: 200, units: 3, tiers });
    expect(r.qtyPercent).toBe(10);
    expect(r.totalDiscount).toBe(20);
    expect(r.net).toBe(180);
    expect(r.lines).toHaveLength(1);
  });
  it("stacks a promo % on top of the quantity discount (sequential)", () => {
    // $200, 10% qty → 180, then 10% promo → 18 off → net 162
    const r = computeStackedDiscounts({ gross: 200, units: 3, tiers, code: { kind: "promo", label: "Promo (SAVE10)", percent: 10 } });
    expect(r.totalDiscount).toBe(38);
    expect(r.net).toBe(162);
    expect(r.lines.map((l) => l.type)).toEqual(["quantity", "promo"]);
  });
  it("applies a flat referral $ off, capped at the remaining subtotal", () => {
    const r = computeStackedDiscounts({ gross: 50, units: 1, code: { kind: "referral", label: "Referral", amount: 10 } });
    expect(r.totalDiscount).toBe(10);
    expect(r.net).toBe(40);
    const capped = computeStackedDiscounts({ gross: 8, units: 1, code: { kind: "referral", label: "Referral", amount: 10 } });
    expect(capped.totalDiscount).toBe(8); // never more than the subtotal
    expect(capped.net).toBe(0);
  });
  it("omits zero lines (no qualifying tier)", () => {
    const r = computeStackedDiscounts({ gross: 100, units: 1, tiers, code: { kind: "promo", label: "P", percent: 10 } });
    expect(r.lines.map((l) => l.type)).toEqual(["promo"]);
    expect(r.net).toBe(90);
  });
});

describe("isSitewideActive", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  it("is false when off, missing, or zero percent", () => {
    expect(isSitewideActive(null, now)).toBe(false);
    expect(isSitewideActive({ sitewide_active: false, sitewide_percent: 20 }, now)).toBe(false);
    expect(isSitewideActive({ sitewide_active: true, sitewide_percent: 0 }, now)).toBe(false);
  });
  it("is true when active with a positive percent and no window", () => {
    expect(isSitewideActive({ sitewide_active: true, sitewide_percent: 20 }, now)).toBe(true);
  });
  it("respects the scheduled start/end window", () => {
    expect(isSitewideActive({ sitewide_active: true, sitewide_percent: 20, sitewide_starts_at: "2026-06-01T00:00:00Z", sitewide_ends_at: "2026-06-30T00:00:00Z" }, now)).toBe(true);
    expect(isSitewideActive({ sitewide_active: true, sitewide_percent: 20, sitewide_starts_at: "2026-07-01T00:00:00Z" }, now)).toBe(false);
    expect(isSitewideActive({ sitewide_active: true, sitewide_percent: 20, sitewide_ends_at: "2026-06-01T00:00:00Z" }, now)).toBe(false);
  });
});

describe("sitewideSalePrice", () => {
  it("applies a site-wide percentage to the base price", () => {
    expect(sitewideSalePrice(129, 20)).toBe(103.2);
    expect(sitewideSalePrice(12, 25)).toBe(9);
    expect(sitewideSalePrice(69, 10)).toBe(62.1);
  });
  it("rounds to cents", () => {
    expect(sitewideSalePrice(189, 15)).toBe(160.65);
    expect(sitewideSalePrice(99.99, 33)).toBe(66.99); // 66.9933 → 66.99
  });
  it("clamps the percentage to 0–100 and coerces junk", () => {
    expect(sitewideSalePrice(100, -5)).toBe(100); // negative → no discount
    expect(sitewideSalePrice(100, 150)).toBe(0); // over 100 → free
    expect(sitewideSalePrice(100, NaN as unknown as number)).toBe(100);
  });
});

describe("promoAlreadyRedeemed (one use per customer)", () => {
  const orders = [
    { email: "Buyer@Example.com", discount_code: "SPRING20" },
    { email: "other@example.com", discount_code: "WELCOME10" },
  ];
  it("matches case-insensitively on email + code", () => {
    expect(promoAlreadyRedeemed(orders, "buyer@example.com", "spring20")).toBe(true);
    expect(promoAlreadyRedeemed(orders, "BUYER@EXAMPLE.COM", "SPRING20")).toBe(true);
  });
  it("is false when this customer never used this code", () => {
    expect(promoAlreadyRedeemed(orders, "buyer@example.com", "WELCOME10")).toBe(false);
    expect(promoAlreadyRedeemed(orders, "new@example.com", "SPRING20")).toBe(false);
  });
  it("is false for empty inputs", () => {
    expect(promoAlreadyRedeemed([], "buyer@example.com", "SPRING20")).toBe(false);
    expect(promoAlreadyRedeemed(orders, "", "SPRING20")).toBe(false);
    expect(promoAlreadyRedeemed(orders, "buyer@example.com", "")).toBe(false);
  });
});
