import { squareConfigured } from "./square.js";

export const PAYMENT_METHODS = ["square", "zelle", "cashapp", "venmo", "ach", "crypto"] as const;
export const MANUAL_PAYMENT_METHODS = ["zelle", "cashapp", "venmo", "ach"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export type PaymentOffer = {
  square: { enabled: boolean };
  zelle: ManualOffer;
  cashapp: ManualOffer;
  venmo: ManualOffer;
  ach: ManualOffer;
  crypto: { enabled: boolean };
};

type ManualOffer = { enabled: boolean; handle: string; instructions: string };
type RawMethod = {
  enabled?: unknown;
  handle?: unknown;
  instructions?: unknown;
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHODS.includes(value.toLowerCase() as PaymentMethod);
}

export function isManualPaymentMethod(value: string): value is ManualPaymentMethod {
  return MANUAL_PAYMENT_METHODS.includes(value as ManualPaymentMethod);
}

/** Shape persisted settings into the exact server-authoritative checkout offer. */
export function buildPaymentOffer(raw: unknown): PaymentOffer {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Record<string, RawMethod>;
  const manual = (key: ManualPaymentMethod): ManualOffer => {
    const item = cfg[key] ?? {};
    const handle = typeof item.handle === "string" ? item.handle.trim() : "";
    const instructions = typeof item.instructions === "string" ? item.instructions.trim() : "";
    const enabled = item.enabled === true && handle.length > 0;
    // A DISABLED method's handle/instructions stay server-side: /api/public/site
    // is unauthenticated, and emitting a switched-off Zelle/Venmo/Cash App
    // handle leaks a personal payment identifier the owner chose to withdraw.
    return enabled ? { enabled, handle, instructions } : { enabled: false, handle: "", instructions: "" };
  };

  return {
    square: { enabled: cfg.square?.enabled === true && squareConfigured() },
    zelle: manual("zelle"),
    cashapp: manual("cashapp"),
    venmo: manual("venmo"),
    ach: manual("ach"),
    // Keep the historical default-on behavior, but never advertise or accept
    // crypto if the server cannot create an invoice.
    crypto: {
      enabled: cfg.crypto?.enabled !== false && !!process.env.NOWPAYMENTS_API_KEY,
    },
  };
}

export function paymentMethodEnabled(offer: PaymentOffer, method: PaymentMethod): boolean {
  return offer[method].enabled;
}
