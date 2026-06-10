import { describe, it, expect } from "vitest";
import {
  round2,
  grossFromItems,
  discountAmount,
  netAmount,
  commissionAmount,
  isFreeOrder,
  isPromoUsable,
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
});
