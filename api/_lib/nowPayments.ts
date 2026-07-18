import { orderCashDue } from "./pricing.js";

export type NowPayment = {
  payment_status?: unknown;
  price_currency?: unknown;
  price_amount?: unknown;
  pay_currency?: unknown;
  pay_amount?: unknown;
  actually_paid?: unknown;
};

export type CryptoPaymentCheck = { ok: true } | { ok: false; reason: string };

// NOWPayments can finish an invoice within its documented underpayment covering
// range. Accept that narrow processor tolerance, never an arbitrary short-pay.
export const MIN_ACTUAL_PAYMENT_RATIO = 0.97;
const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";

function finitePositive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Verify both the USD invoice value and, when supplied, actual crypto received. */
export function verifyNowPayment(
  payload: NowPayment,
  order: {
    net_amount?: unknown;
    shipping_amount?: unknown;
    credit_applied?: unknown;
  }
): CryptoPaymentCheck {
  if (String(payload.payment_status ?? "").toLowerCase() !== "finished") {
    return { ok: false, reason: "Payment is not finished." };
  }

  if (payload.price_currency != null && String(payload.price_currency).toLowerCase() !== "usd") {
    return { ok: false, reason: "Invoice currency is not USD." };
  }

  const due = orderCashDue(order.net_amount, order.shipping_amount, order.credit_applied);
  const invoice = finitePositive(payload.price_amount);
  if (invoice == null || Math.abs(invoice - due) > 0.01) {
    return {
      ok: false,
      reason: `Invoice amount does not match the $${due.toFixed(2)} order balance.`,
    };
  }

  if (typeof payload.pay_currency !== "string" || !payload.pay_currency.trim()) {
    return { ok: false, reason: "Payment currency is missing." };
  }
  const expectedCrypto = finitePositive(payload.pay_amount);
  const actualCrypto = finitePositive(payload.actually_paid);
  if (expectedCrypto == null) {
    return { ok: false, reason: "Expected crypto amount is invalid." };
  }
  if (actualCrypto == null) {
    return { ok: false, reason: "Actual crypto amount is invalid." };
  }
  if (actualCrypto + Number.EPSILON < expectedCrypto * MIN_ACTUAL_PAYMENT_RATIO) {
    return {
      ok: false,
      reason: "Actual crypto received is below the accepted payment tolerance.",
    };
  }
  return { ok: true };
}

/** Convert the actually received asset to USD as NOWPayments recommends for wrong-asset deposits. */
export async function estimateNowPaymentUsd(payload: NowPayment, apiKey: string): Promise<number | null> {
  const amount = finitePositive(payload.actually_paid);
  const currency = typeof payload.pay_currency === "string" ? payload.pay_currency.trim().toLowerCase() : "";
  if (amount == null || !currency || !apiKey) return null;
  const query = new URLSearchParams({
    amount: String(amount),
    currency_from: currency,
    currency_to: "usd",
  });
  const response = await fetch(`${NOWPAYMENTS_API}/estimate?${query}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { estimated_amount?: unknown };
  return finitePositive(data.estimated_amount);
}

export function estimatedUsdCoversOrder(estimatedUsd: number | null, dueUsd: number): boolean {
  return estimatedUsd != null && Number.isFinite(estimatedUsd) && estimatedUsd + 0.01 >= dueUsd * MIN_ACTUAL_PAYMENT_RATIO;
}
