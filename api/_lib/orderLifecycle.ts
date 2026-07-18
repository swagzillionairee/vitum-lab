/*
 * orderLifecycle.ts — pure decisions about what a verified, finished
 * NowPayments IPN means for an order in a given status. Kept pure for unit
 * testing; the webhook handler acts on the returned action.
 */

export type PaidIpnAction =
  /** Order is awaiting payment — confirm it, decrement stock, send emails. */
  | "fulfill"
  /** Already paid (duplicate finished IPN). Re-run idempotent emails only. */
  | "resend_emails"
  /** The order is cancelled/failed (e.g. auto-expired) but money arrived anyway.
   * Do NOT confirm or email the customer — flag for a manual refund/fulfill. */
  | "late_payment";

export function paidIpnAction(orderStatus: string | null | undefined): PaidIpnAction {
  if (orderStatus === "pending") return "fulfill";
  if (orderStatus === "cancelled" || orderStatus === "failed") return "late_payment";
  return "resend_emails";
}
