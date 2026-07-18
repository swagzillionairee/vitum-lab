import { describe, expect, it } from "vitest";
import { estimatedUsdCoversOrder, verifyNowPayment } from "./nowPayments.js";

const order = { net_amount: 80, shipping_amount: 10, credit_applied: 5 };
const payment = {
  payment_status: "finished",
  price_currency: "usd",
  price_amount: 85,
  pay_currency: "btc",
  pay_amount: 0.001,
  actually_paid: 0.001,
};

describe("verifyNowPayment", () => {
  it("accepts a finished payment whose invoice and actual crypto match", () => {
    expect(verifyNowPayment(payment, order)).toEqual({ ok: true });
    expect(verifyNowPayment({ ...payment, actually_paid: 0.00097 }, order)).toEqual({ ok: true });
  });

  it("waits for finished and rejects wrong fiat invoice values", () => {
    expect(verifyNowPayment({ ...payment, payment_status: "confirmed" }, order).ok).toBe(false);
    expect(verifyNowPayment({ ...payment, price_currency: "eur" }, order).ok).toBe(false);
    expect(verifyNowPayment({ ...payment, price_amount: 84.98 }, order).ok).toBe(false);
    expect(verifyNowPayment({ ...payment, price_amount: undefined }, order).ok).toBe(false);
    expect(verifyNowPayment({ ...payment, actually_paid: undefined }, order).ok).toBe(false);
    expect(verifyNowPayment({ ...payment, pay_currency: undefined }, order).ok).toBe(false);
  });

  it("rejects a processor-finished short-pay outside the narrow tolerance", () => {
    expect(verifyNowPayment({ ...payment, actually_paid: 0.000969 }, order).ok).toBe(false);
    expect(verifyNowPayment({ ...payment, actually_paid: "nope" }, order).ok).toBe(false);
  });
});

describe("estimatedUsdCoversOrder", () => {
  it("allows only the narrow processor covering tolerance", () => {
    expect(estimatedUsdCoversOrder(97, 100)).toBe(true);
    expect(estimatedUsdCoversOrder(96.98, 100)).toBe(false);
    expect(estimatedUsdCoversOrder(null, 100)).toBe(false);
  });
});
