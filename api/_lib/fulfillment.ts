/*
 * fulfillment.ts — shared order-fulfillment steps for a confirmed payment,
 * used by the Square charge (api/create-crypto-payment) and the admin Mark
 * Paid / Re-check paths. The NowPayments webhook still has an equivalent inline
 * copy. Every step is idempotent so duplicate confirmations are safe.
 */
import { supabaseAdmin } from "./supabase-admin.js";
import { sendOrderEvent, sendAffiliateCommission, type EmailOrder } from "./email.js";
import { getRewardConfig, earnLoyalty, grantReferralReward, releaseDiscountRedemption } from "./credit.js";

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
 * Returns true when THIS call won the pending→confirmed claim (side effects ran),
 * false when another caller already confirmed it — or the order is no longer
 * pending at all (e.g. the hourly cron expired it a moment earlier). Callers
 * must re-check the order before emailing on a false return: a payment landing
 * on a just-cancelled order must alert the admin, not tell the customer
 * "confirmed" while the row stays cancelled.
 */
export async function confirmPaidOrder(order: any, meta: PaymentMeta): Promise<boolean> {
  // Atomically CLAIM the pending→confirmed transition. Only the caller that flips
  // the row (WHERE status='pending') runs the side effects below, so a synchronous
  // confirm racing its own webhook — or a processor firing two paid callbacks in
  // parallel (NowPayments confirmed+finished) — can't double-
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

  if (!claimed) return false; // another confirmation (or an expiry) won the race

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
  return true;
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

  // Snapshot BEFORE the claim: stock is only decremented on confirmation, so a
  // refund on a still-pending order (charge landed pending, then reversed) must
  // NOT restock — that would inflate inventory with units never taken out.
  const wasPaid = order.status === "confirmed" || order.status === "finished";

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
    // Claim against the snapshotted status (CAS): if the row changed since our
    // read — another refund event, an admin cancel, a concurrent confirm — we
    // lose the claim and do nothing, so restock can never run twice.
    .eq("status", order.status)
    .select("id")
    .maybeSingle();
  if (!claimed) return; // the order changed under us — the winner handles it

  // Restock only paid orders that never shipped (a shipped order's stock is gone;
  // a pending order's stock was never decremented).
  const shipped = order.fulfillment_status === "shipped" || order.fulfillment_status === "delivered";
  if (wasPaid && !shipped) {
    const items = (order.items as { cartCode: string; quantity: number; price: number }[]) ?? [];
    for (const item of items) {
      if (item.price > 0 && item.cartCode !== FREE_GIFT_CODE) {
        await supabaseAdmin.rpc("increment_stock", { p_cart_code: item.cartCode, p_qty: item.quantity }).then(() => {}, () => {});
      }
    }
  }

  // Return the promo's global max_uses slot (counted on confirmation) and free
  // the per-customer one-use reservation immediately (rather than waiting for
  // the hourly sweep) so the customer can reuse their code on a retry.
  if (wasPaid && order.discount_code) {
    await supabaseAdmin.rpc("decrement_promo_use", { p_code: order.discount_code }).then(() => {}, () => {});
  }
  await releaseDiscountRedemption(order.id).catch(() => {});

  // Surface a residual store-credit deficit: if the customer already SPENT the
  // loyalty/referral credit THIS order earned (as tender on another still-
  // confirmed order) before this reversal, excluding this order's earn rows
  // drives their ledger balance negative. store_credit_balance keeps the deficit
  // (it nets against future earnings) but getBalance floors it to 0, so it can't
  // be spent — flag it on the order so the owner can pursue it rather than
  // silently absorbing the loss. Best-effort; never blocks the clawback.
  if (wasPaid && order.email) {
    try {
      const { data: bal } = await supabaseAdmin.rpc("store_credit_balance", { p_email: order.email });
      const raw = Number(bal) || 0;
      if (raw < 0) {
        const prior = order.admin_notes ? `${order.admin_notes}\n\n${note}` : note;
        const deficitNote = `⚠️ This clawback left ${order.email} with a store-credit deficit of $${Math.abs(raw).toFixed(2)} — earned credit was already spent before the reversal. It nets against future earnings and cannot be spent now; pursue manually if warranted.`;
        await supabaseAdmin.from("orders").update({ admin_notes: `${prior}\n\n${deficitNote}` }).eq("id", order.id);
      }
    } catch (err) {
      console.error("refundClawback deficit check failed:", err);
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
