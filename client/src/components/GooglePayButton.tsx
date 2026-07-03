/*
 * GooglePayButton.tsx — the OFFICIAL Google Pay button, required by Google Pay
 * brand guidelines (a custom "Pay with Google Pay" button is a common rejection
 * reason). It's rendered by Google's own pay.js via PaymentsClient.createButton,
 * so the mark/sizing/styling are always compliant.
 *
 * pay.js is already loaded by core-js's availability probe (googlePayAvailable),
 * so window.google.payments.api is normally present by the time this mounts; we
 * poll briefly in case the button renders first. onClick fires inside the real
 * button click (a user gesture), so the wallet sheet can open.
 */
import { useEffect, useRef } from "react";
import { GPAY_SANDBOX, GPAY_GATEWAY_MERCHANT_ID } from "@/lib/wallets";

// pay.js is untyped here — narrow to the two calls we use.
type GooglePayApi = {
  PaymentsClient: new (opts: { environment: "TEST" | "PRODUCTION" }) => {
    createButton: (opts: Record<string, unknown>) => HTMLElement;
  };
};

export default function GooglePayButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    let cancelled = false;

    const tryRender = (): boolean => {
      const api = (window as unknown as { google?: { payments?: { api?: GooglePayApi } } })
        .google?.payments?.api;
      if (!api || !ref.current || cancelled) return false;

      const client = new api.PaymentsClient({ environment: GPAY_SANDBOX ? "TEST" : "PRODUCTION" });
      const base = {
        onClick: () => onClickRef.current(),
        buttonColor: "black",
        buttonType: "pay",
        buttonSizeMode: "fill",
        buttonRadius: 12,
      };
      let button: HTMLElement | null = null;
      try {
        // Newer API versions want allowedPaymentMethods; it's only used for
        // button eligibility here (the actual charge is driven by core-js).
        button = client.createButton({
          ...base,
          allowedPaymentMethods: [
            {
              type: "CARD",
              parameters: {
                allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
                allowedCardNetworks: ["AMEX", "DISCOVER", "MASTERCARD", "VISA"],
              },
              tokenizationSpecification: {
                type: "PAYMENT_GATEWAY",
                parameters: { gateway: "basistheory", gatewayMerchantId: GPAY_GATEWAY_MERCHANT_ID },
              },
            },
          ],
        });
      } catch {
        try {
          button = client.createButton(base);
        } catch {
          button = null;
        }
      }
      if (!button) return false;
      ref.current.replaceChildren(button);
      return true;
    };

    if (tryRender()) return () => { cancelled = true; };
    const iv = setInterval(() => { if (tryRender()) clearInterval(iv); }, 300);
    const to = setTimeout(() => clearInterval(iv), 8000);
    return () => { cancelled = true; clearInterval(iv); clearTimeout(to); };
  }, []);

  return (
    <div
      ref={ref}
      aria-disabled={disabled}
      className={`w-full [&>*]:!w-full ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    />
  );
}
