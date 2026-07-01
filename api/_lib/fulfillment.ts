/*
 * fulfillment.ts — shared order-fulfillment steps for a confirmed payment,
 * used by the Tagada webhook (api/public/tagada-webhook). The NowPayments
 * webhook still has an equivalent inline copy. Every step is idempotent so
 * duplicate webhooks are safe.
 */
import { supabaseAdmin } from "./supabase-admin.js";
import { sendOrderEvent, sendAffiliateCommission, type EmailOrder } from "./email.js";
import { getRewardConfig, earnLoyalty, grantReferralReward } from "./credit.js";

/** Columns a webhook needs to confirm/flag an order (mirrors nowpayments-webhook). */
export const ORDER_COLS =
  "id, email, items, gross_amount, discount_amount, discount_code, net_amount, shipping_amount, credit_applied, referral_code, shipping_address, status, affiliate_id, commission_amount, emails_sent, admin_notes";

/** Processor-agnostic payment details recorded on the order. */
export type PaymentMeta = {
  payCurrency?: string | null;
  payAmount?: number | string | null;
  paymentId?: string | null;
};

const FREE_GIFT_CODE = "bac-water-free";

// Email the attributed affiliate their commission (once, via emails_sent).
async function notifyAffiliate(order: any): Promise<void> {
  const commission = Number(order.commission_amount) || 0;
  if (!order.affiliate_id || commission <= 0) return;
  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("email, code")
    .eq("id", order.affiliate_id)
    .maybeSingle();
  if (aff?.email) {
    await sendAffiliateCommission(order as EmailOrder, { email: aff.email, code: aff.code, commission });
  }
}

/**
 * Decrement stock, mark the order confirmed (+ payment meta), count promo use,
 * and grant loyalty/referral rewards. Call once, when the order is pending.
 */
export async function confirmPaidOrder(order: any, meta: PaymentMeta): Promise<void> {
  const items = (order.items as { cartCode: string; quantity: number; price: number }[]) ?? [];
  for (const item of items) {
    if (item.price > 0 && item.cartCode !== FREE_GIFT_CODE) {
      const { error: decErr } = await supabaseAdmin.rpc("decrement_stock", {
        p_cart_code: item.cartCode,
        p_qty: item.quantity,
      });
      // Payment already succeeded — never block confirmation on a decrement
      // failure; log the oversell (a concurrent last-unit sale) for reconciliation.
      if (decErr) {
        console.error(`⚠️ OVERSOLD: decrement_stock failed for order ${order.id} — ${item.cartCode} x${item.quantity}: ${decErr.message}`);
      }
    }
  }

  await supabaseAdmin
    .from("orders")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      pay_currency: meta.payCurrency ?? null,
      pay_amount: meta.payAmount ?? null,
      payment_id: meta.paymentId != null ? String(meta.paymentId) : null,
    })
    .eq("id", order.id);

  // Count promo usage on first confirmation (no-op for affiliate codes).
  if (order.discount_code) {
    await supabaseAdmin.rpc("increment_promo_use", { p_code: order.discount_code }).then(
      () => {},
      () => {},
    );
  }

  // Loyalty earn + referral reward (idempotent via the ledger).
  try {
    const cfg = await getRewardConfig();
    await earnLoyalty(order, cfg.loyaltyPercent);
    await grantReferralReward(order, cfg.referrerAmount);
  } catch (err) {
    console.error("Failed to apply loyalty/referral rewards:", err);
  }
}

/** Idempotent confirmation emails (customer + admin alert + affiliate commission). */
export async function sendConfirmationEmails(order: any): Promise<void> {
  await sendOrderEvent(order as EmailOrder, "confirmed");
  await sendOrderEvent(order as EmailOrder, "admin_new_order");
  await notifyAffiliate(order);
}

/**
 * Money landed on a cancelled/failed order (paid after auto-expiry). Do NOT
 * confirm or email the customer — record the payment + alert the admin once.
 */
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
