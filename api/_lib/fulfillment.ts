/* Shared, idempotent order lifecycle operations. */
import { supabaseAdmin } from "./supabase-admin.js";
import { sendOrderEvent, sendAffiliateCommission, type EmailOrder } from "./email.js";
import { getRewardConfig, earnLoyalty, grantReferralReward } from "./credit.js";

export const ORDER_COLS = "id, email, items, gross_amount, discount_amount, discount_code, net_amount, shipping_amount, credit_applied, referral_code, shipping_address, status, fulfillment_status, affiliate_id, commission_amount, emails_sent, admin_notes";

export type PaymentMeta = {
  payCurrency?: string | null;
  payAmount?: number | string | null;
  paymentId?: string | null;
};

async function notifyAffiliate(order: any): Promise<void> {
  const commission = Number(order.commission_amount) || 0;
  if (!order.affiliate_id || commission <= 0) return;
  const { data: affiliate } = await supabaseAdmin.from("affiliates").select("email, code").eq("id", order.affiliate_id).maybeSingle();
  if (affiliate?.email) {
    await sendAffiliateCommission(order as EmailOrder, {
      email: affiliate.email,
      code: affiliate.code,
      commission,
    });
  }
}

/**
 * Atomically claim pending -> confirmed, decrement every paid item, and count
 * promo use in Postgres. An inventory failure rolls the whole transaction back.
 */
export async function confirmPaidOrder(order: any, meta: PaymentMeta): Promise<boolean> {
  const payAmount = meta.payAmount == null ? null : Number(meta.payAmount);
  if (payAmount != null && (!Number.isFinite(payAmount) || payAmount < 0)) {
    throw new Error("Invalid payment amount.");
  }

  const { data: claimed, error } = await supabaseAdmin.rpc("confirm_order_paid", {
    p_order_id: order.id,
    p_pay_currency: meta.payCurrency ?? null,
    p_pay_amount: payAmount,
    p_payment_id: meta.paymentId != null ? String(meta.paymentId) : null,
  });
  if (error) throw new Error(error.message);
  if (claimed !== true) return false;

  // Ledger writes are independently idempotent per order/reason. Keeping email
  // and rewards outside the stock transaction prevents network work in Postgres.
  try {
    const config = await getRewardConfig();
    await earnLoyalty(order, config.loyaltyPercent);
    await grantReferralReward(order, config.referrerAmount);
  } catch (error) {
    console.error("Failed to apply loyalty/referral rewards:", error);
  }
  return true;
}

export async function sendConfirmationEmails(order: any): Promise<void> {
  await sendOrderEvent(order as EmailOrder, "confirmed");
  await sendOrderEvent(order as EmailOrder, "admin_new_order");
  await notifyAffiliate(order);
}

/** Atomically cancel and reconcile stock, promo use, and code reservation. */
export async function cancelOrder(order: any, reason: string, note?: string | null): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("cancel_order", {
    p_order_id: order.id,
    p_expected_status: order.status,
    p_reason: reason,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Refund/chargeback reconciliation. Duplicate and racing callbacks are no-ops. */
export async function refundClawback(order: any, reason: string): Promise<void> {
  if (order.status === "cancelled" || order.status === "failed") return;
  const note = `${reason} - auto-cancelled so rewards, commission, and referral credit are clawed back.`;
  await cancelOrder(order, reason, note);
}

/** Record money on an order that could not safely be auto-fulfilled. */
export async function recordLatePayment(order: any, meta: PaymentMeta, note: string): Promise<void> {
  if (order.emails_sent?.admin_late_payment) return;
  await supabaseAdmin
    .from("orders")
    .update({
      admin_notes: order.admin_notes ? `${order.admin_notes}\n\n${note}` : note,
      pay_currency: meta.payCurrency ?? null,
      pay_amount: meta.payAmount ?? null,
      payment_id: meta.paymentId != null ? String(meta.paymentId) : null,
    })
    .eq("id", order.id);
  await sendOrderEvent(order as EmailOrder, "admin_late_payment");
}
