import { describe, it, expect } from "vitest";
import * as client from "./discounts";
import * as server from "../../../api/_lib/pricing";

/*
 * Client/server pricing parity. client/src/lib/discounts.ts is a hand-written
 * mirror of api/_lib/pricing.ts — checkout displays totals from the client
 * copy, then the server recomputes and refuses on drift. A change to one side
 * without the other surfaces to customers as an opaque "your total changed,
 * refresh and try again" at the final step. This suite makes that drift a CI
 * failure instead.
 */
describe("client/server pricing parity", () => {
  it("shares the shipping + threshold constants", () => {
    expect(client.SHIPPING_FEE).toBe(server.SHIPPING_FEE);
    expect(client.FREE_SHIPPING_THRESHOLD).toBe(server.FREE_SHIPPING_THRESHOLD);
    expect(client.SHIPPING_PROTECTION_FEE).toBe(server.SHIPPING_PROTECTION_FEE);
  });

  it("pins the free-gift threshold to the server's value", () => {
    // The server constant lives in api/create-crypto-payment.ts (importing the
    // endpoint would boot the Supabase admin client, so it's pinned by value —
    // change BOTH together).
    expect(client.FREE_GIFT_THRESHOLD).toBe(100);
  });

  it("rounds identically on half-cent boundaries (EPSILON nudge)", () => {
    for (const n of [1.005, 2.675, 10.015, 0.125, 99.995, 129.955]) {
      expect(client.round2(n)).toBe(server.round2(n));
    }
    // The specific value the nudge exists for: 1.005 must round UP.
    expect(client.round2(1.005)).toBe(1.01);
  });

  it("computes identical shipping fees", () => {
    for (const gross of [0, 10, 74.99, 75, 75.01, 100, 500]) {
      expect(client.shippingFee(gross)).toBe(server.shippingFee(gross));
    }
  });

  it("computes identical quantity-tier discounts", () => {
    const tiers = [
      { min_qty: 2, percent: 5 },
      { min_qty: 5, percent: 10 },
      { min_qty: 10, percent: 15 },
    ];
    for (const units of [0, 1, 2, 4, 5, 9, 10, 50]) {
      expect(client.quantityDiscountPercent(tiers, units)).toBe(server.quantityDiscountPercent(tiers, units));
    }
    expect(client.quantityDiscountPercent([], 5)).toBe(server.quantityDiscountPercent([], 5));
  });
});
