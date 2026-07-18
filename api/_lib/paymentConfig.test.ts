import { afterEach, describe, expect, it } from "vitest";
import { buildPaymentOffer, isPaymentMethod, paymentMethodEnabled } from "./paymentConfig.js";

const previousNowPaymentsKey = process.env.NOWPAYMENTS_API_KEY;

afterEach(() => {
  if (previousNowPaymentsKey == null) delete process.env.NOWPAYMENTS_API_KEY;
  else process.env.NOWPAYMENTS_API_KEY = previousNowPaymentsKey;
});

describe("payment configuration", () => {
  it("requires both an enabled setting and a usable server configuration", () => {
    delete process.env.NOWPAYMENTS_API_KEY;
    const disabled = buildPaymentOffer({
      venmo: { enabled: true, handle: "   " },
      crypto: { enabled: true },
    });
    expect(disabled.venmo.enabled).toBe(false);
    expect(disabled.crypto.enabled).toBe(false);

    process.env.NOWPAYMENTS_API_KEY = "test-key";
    const enabled = buildPaymentOffer({ venmo: { enabled: true, handle: " @store " }, crypto: { enabled: true } });
    expect(enabled.venmo).toMatchObject({ enabled: true, handle: "@store" });
    expect(paymentMethodEnabled(enabled, "crypto")).toBe(true);
  });

  it("rejects unknown methods instead of silently falling back to crypto", () => {
    expect(isPaymentMethod("crypto")).toBe(true);
    expect(isPaymentMethod("wire-transfer")).toBe(false);
  });
});
