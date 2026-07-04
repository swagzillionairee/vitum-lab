/*
 * wallets.ts — Google Pay / Apple Pay via TagadaPay core-js (native wallets,
 * tokenized through BasisTheory). Each pay function opens the native wallet
 * sheet, and on success hands back a base64 TagadaToken in the SAME shape the
 * card box produces — so it flows through the exact server charge path
 * (`/api/create-crypto-payment` → chargeCard → createFromToken → payments.process)
 * with no server changes.
 *
 * Config comes from env: VITE_TAGADA_ENV picks the BasisTheory vault (test vs
 * live, must match the TAGADA_API_KEY mode) and VITE_GOOGLE_PAY_MERCHANT_ID is
 * the Google Pay Business Console merchant id (required for production Google
 * Pay). Must be called from a user gesture (click handler).
 */
import {
  isGooglePayAvailable,
  startGooglePaySession,
  isApplePayAvailable,
  startApplePaySession,
  createTagadaDigitalWalletToken,
  getBasisTheoryApiKey,
  getGoogleTenantId,
} from "@tagadapay/core-js";

const ENV = (import.meta.env.VITE_TAGADA_ENV as string) || "development";
const SANDBOXED = ENV !== "production";
// BasisTheory vault to use — test vault in every non-production env.
const BT_ENV = (SANDBOXED ? "development" : "production") as "development" | "production";
const MERCHANT_NAME = "Vitum Lab";
const COUNTRY = "US";
const GOOGLE_PAY_MERCHANT_ID = (import.meta.env.VITE_GOOGLE_PAY_MERCHANT_ID as string) || "";

// Google Pay's environment is DECOUPLED from the card vault. Production Google
// Pay requires Google Pay Business Console approval (the brand-verification
// review these screenshots are for); until it's granted, a PRODUCTION Google Pay
// charge fails in the sheet with OR_BIBED_11. VITE_GOOGLE_PAY_SANDBOX="true"
// runs Google Pay in TEST (a working sheet with test cards — for the screenshots
// + testing) while cards stay live; "false" forces production; unset falls back
// to VITE_TAGADA_ENV. The BasisTheory vault follows the Google Pay env so the
// token matches the environment.
export const GPAY_SANDBOX = (() => {
  const v = import.meta.env.VITE_GOOGLE_PAY_SANDBOX as string | undefined;
  if (v === "true") return true;
  if (v === "false") return false;
  return SANDBOXED;
})();
const GPAY_BT_ENV = (GPAY_SANDBOX ? "development" : "production") as "development" | "production";
// gatewayMerchantId used when rendering the official Google Pay button (BasisTheory tenant).
export const GPAY_GATEWAY_MERCHANT_ID = getGoogleTenantId(GPAY_BT_ENV);

/** Availability probes — resolve false (never throw) so the UI can hide the tile. */
export const googlePayAvailable = (): Promise<boolean> =>
  isGooglePayAvailable(GPAY_SANDBOX).catch(() => false);
export const applePayAvailable = (): Promise<boolean> => isApplePayAvailable().catch(() => false);

// Wrap the wallet token result into the base64 TagadaToken the server decodes.
const toTagadaToken = (result: unknown, type: "google_pay" | "apple_pay"): string =>
  btoa(JSON.stringify(createTagadaDigitalWalletToken(result as never, type)));

/**
 * Map a wallet SDK error to customer-safe copy. The wallet SDKs surface raw
 * provider/Apple/Google strings — e.g. Apple's "Merchant validation failed"
 * when the store's wallet domain isn't registered / the method isn't provisioned
 * yet — which must never reach a customer (processor-agnostic-copy rule) and
 * shouldn't leak provider internals. The raw message is logged for debugging;
 * the shopper sees a friendly line pointing them back to the other tiles.
 */
function walletErrorMessage(wallet: "Apple Pay" | "Google Pay", raw?: string): string {
  if (raw) console.warn(`[wallet] ${wallet}: ${raw}`);
  const r = (raw || "").toLowerCase();
  // Provisioning / setup gaps (unregistered domain, merchant-session failure,
  // method not enabled) — the wallet simply isn't available for this store.
  if (/merchant|validation|domain|not enabled|unavailable|not available/.test(r)) {
    return `${wallet} isn't available right now — please choose another payment method.`;
  }
  // Everything else (declines, transient failures) — generic friendly copy.
  return `${wallet} didn't go through — please try again or choose another payment method.`;
}

/** Open the Google Pay sheet; on success hand a TagadaToken to `onToken`. */
export function payWithGooglePay(
  amountDue: number,
  onToken: (tagadaToken: string) => void,
  onError: (msg: string) => void,
): void {
  try {
    startGooglePaySession(
      {
        basisTheoryApiKey: getBasisTheoryApiKey(GPAY_BT_ENV),
        basisTheoryTenantId: getGoogleTenantId(GPAY_BT_ENV),
        merchantId: GOOGLE_PAY_MERCHANT_ID,
        merchantName: MERCHANT_NAME,
        countryCode: COUNTRY,
        sandboxed: GPAY_SANDBOX,
      },
      { currency: "USD", totalAmountMinor: Math.round(amountDue * 100), totalPriceStatus: "FINAL" },
      {
        onSuccess: (token) => onToken(toTagadaToken(token, "google_pay")),
        onError: (msg) => onError(walletErrorMessage("Google Pay", msg)),
        onCancel: () => {},
      },
    );
  } catch (e) {
    onError(walletErrorMessage("Google Pay", (e as Error)?.message));
  }
}

/** Open the Apple Pay sheet; on success hand a TagadaToken to `onToken`. */
export function payWithApplePay(
  amountDue: number,
  onToken: (tagadaToken: string) => void,
  onError: (msg: string) => void,
): void {
  try {
    startApplePaySession(
      { basisTheoryApiKey: getBasisTheoryApiKey(BT_ENV), countryCode: COUNTRY, storeName: MERCHANT_NAME },
      { currency: "USD", totalAmountMinor: Math.round(amountDue * 100) },
      {
        onSuccess: (token) => onToken(toTagadaToken(token, "apple_pay")),
        onError: (msg) => onError(walletErrorMessage("Apple Pay", msg)),
        onCancel: () => {},
      },
    );
  } catch (e) {
    onError(walletErrorMessage("Apple Pay", (e as Error)?.message));
  }
}
