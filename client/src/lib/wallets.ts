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

/** Availability probes — resolve false (never throw) so the UI can hide the tile. */
export const googlePayAvailable = (): Promise<boolean> =>
  isGooglePayAvailable(SANDBOXED).catch(() => false);
export const applePayAvailable = (): Promise<boolean> => isApplePayAvailable().catch(() => false);

// Wrap the wallet token result into the base64 TagadaToken the server decodes.
const toTagadaToken = (result: unknown, type: "google_pay" | "apple_pay"): string =>
  btoa(JSON.stringify(createTagadaDigitalWalletToken(result as never, type)));

/** Open the Google Pay sheet; on success hand a TagadaToken to `onToken`. */
export function payWithGooglePay(
  amountDue: number,
  onToken: (tagadaToken: string) => void,
  onError: (msg: string) => void,
): void {
  try {
    startGooglePaySession(
      {
        basisTheoryApiKey: getBasisTheoryApiKey(BT_ENV),
        basisTheoryTenantId: getGoogleTenantId(BT_ENV),
        merchantId: GOOGLE_PAY_MERCHANT_ID,
        merchantName: MERCHANT_NAME,
        countryCode: COUNTRY,
        sandboxed: SANDBOXED,
      },
      { currency: "USD", totalAmountMinor: Math.round(amountDue * 100), totalPriceStatus: "FINAL" },
      {
        onSuccess: (token) => onToken(toTagadaToken(token, "google_pay")),
        onError: (msg) => onError(msg || "Google Pay didn't complete — please try another method."),
        onCancel: () => {},
      },
    );
  } catch (e) {
    onError((e as Error)?.message || "Google Pay is unavailable right now.");
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
        onError: (msg) => onError(msg || "Apple Pay didn't complete — please try another method."),
        onCancel: () => {},
      },
    );
  } catch (e) {
    onError((e as Error)?.message || "Apple Pay is unavailable right now.");
  }
}
