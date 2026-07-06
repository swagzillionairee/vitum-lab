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
  "id, email, items, gross_amount, discount_amount, discount_code, net_amount, shipping_amount, credit_applied, referral_code, shipping_address, status, fulfillment_status, affiliate_id, commission_amount, emails_sent, admin_notes";

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
  // Atomically CLAIM the pending→confirmed transition. Only the caller that flips
  // the row (WHERE status='pending') runs the side effects below, so a synchronous
  // confirm racing its own webhook — or a processor firing two paid callbacks in
  // parallel (NowPayments confirmed+finished, a Tagada retry) — can't double-
  // decrement stock or double-count the promo. A losing/duplicate call updates 0
  // rows and returns early; confirmation emails are sent separately and stay
  // idempotent via orders.emails_sent.
  const { data: claimed } = await supabaseAdmin
    .from("orders")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      pay_currency: meta.payCurrency ?? null,
      pay_amount: meta.payAmount ?? null,
      payment_id: meta.paymentId != null ? String(meta.paymentId) : null,
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!claimed) return; // another confirmation already won the race — do nothing

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
 * A refund / chargeback on an order: revert it to cancelled so it stops counting
 * everywhere status drives the books — store credit, loyalty, affiliate commission
 * and the referral bounty all exclude cancelled/failed orders, so cancelling is a
 * full clawback with no explicit reversals. Restock the paid items only if nothing
 * shipped yet. Idempotent + atomic: only the caller that flips the row restocks, so
 * duplicate refund webhooks can't double-restock.
 */
export async function refundClawback(order: any, reason: string): Promise<void> {
  if (order.status === "cancelled" || order.status === "failed") return;

  const note = `♻️ ${reason} — auto-cancelled so rewards, commission, and referral credit are clawed back.`;
  const { data: claimed } = await supabaseAdmin
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
      admin_notes: order.admin_notes ? `${order.admin_notes}\n\n${note}` : note,
    })
    .eq("id", order.id)
    .not("status", "in", "(cancelled,failed)")
    .select("id")
    .maybeSingle();
  if (!claimed) return; // another refund event already clawed it back

  // Restock only if nothing shipped (a shipped/delivered order's stock is gone).
  const shipped = order.fulfillment_status === "shipped" || order.fulfillment_status === "delivered";
  if (!shipped) {
    const items = (order.items as { cartCode: string; quantity: number; price: number }[]) ?? [];
    for (const item of items) {
      if (item.price > 0 && item.cartCode !== FREE_GIFT_CODE) {
        await supabaseAdmin.rpc("increment_stock", { p_cart_code: item.cartCode, p_qty: item.quantity }).then(() => {}, () => {});
      }
    }
  }
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
