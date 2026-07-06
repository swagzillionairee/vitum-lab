import crypto from "node:crypto";
import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sendOrderEvent, sendAffiliateCommission, type EmailOrder } from "./_lib/email.js";
import { paidIpnAction } from "./_lib/orderLifecycle.js";
import { confirmPaidOrder, refundClawback, recordLatePayment } from "./_lib/fulfillment.js";
import { releaseDiscountRedemption } from "./_lib/credit.js";

function sortKeys(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

const ORDER_COLS =
  "id, email, items, gross_amount, discount_amount, discount_code, net_amount, shipping_amount, credit_applied, referral_code, shipping_address, status, fulfillment_status, affiliate_id, commission_amount, emails_sent, admin_notes";

// Email the attributed affiliate their commission (once, via emails_sent).
async function notifyAffiliate(order: any) {
  const commission = Number(order.commission_amount) || 0;
  if (!order.affiliate_id || commission <= 0) return;
  const { data: aff } = await supabaseAdmin
    .from("affiliates").select("email, code").eq("id", order.affiliate_id).maybeSingle();
  if (aff?.email) {
    await sendAffiliateCommission(order as EmailOrder, { email: aff.email, code: aff.code, commission });
  }
}

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const signature = req.headers["x-nowpayments-sig"] as string;

  try {
    const payload = JSON.parse(rawBody);
    const sorted = sortKeys(payload);
    const hmac = crypto.createHmac("sha512", process.env.NOWPAYMENTS_IPN_SECRET!);
    hmac.update(JSON.stringify(sorted));
    const computed = hmac.digest("hex");

    const sigBuf = Buffer.from(signature ?? "");
    const cmpBuf = Buffer.from(computed);
    if (sigBuf.length !== cmpBuf.length || !crypto.timingSafeEqual(cmpBuf, sigBuf)) {
      res.status(401).send("Invalid signature");
      return;
    }

    const status: string = payload.payment_status;
    console.log(`ℹ️  NowPayments IPN — order ${payload.order_id}: ${status}`);

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLS)
      .eq("id", payload.order_id)
      .maybeSingle();

    if (!order) {
      res.status(200).send("OK");
      return;
    }

    if (status === "finished" || status === "confirmed") {
      const action = paidIpnAction(order.status);

      if (action === "late_payment") {
        // Money arrived on a cancelled/failed order — e.g. the customer paid the
        // crypto invoice after the 24h auto-expiry. The order stays dead (no
        // stock decrement, no customer "confirmed" email); record the payment
        // and alert the admin once so it can be refunded or fulfilled manually.
        try {
          if (!order.emails_sent?.admin_late_payment) {
            const note = `⚠️ Payment received (IPN "${status}", payment id ${payload.payment_id ?? "unknown"}) AFTER this order was ${order.status}. Not fulfilled automatically — refund the customer or fulfill manually.`;
            await supabaseAdmin
              .from("orders")
              .update({
                admin_notes: order.admin_notes ? `${order.admin_notes}\n\n${note}` : note,
                pay_currency: payload.pay_currency ?? null,
                pay_amount: payload.actually_paid ?? payload.pay_amount ?? null,
                payment_id: payload.payment_id != null ? String(payload.payment_id) : null,
              })
              .eq("id", payload.order_id);
            await sendOrderEvent(order as EmailOrder, "admin_late_payment");
          }
        } catch (err) {
          console.error("Failed to flag late payment:", err);
        }
        res.status(200).send("OK");
        return;
      }

      // Amount-guard (mirror of the Tagada webhook's): the invoice was created
      // with price_amount = the order's server-computed amountDue in USD. If the
      // IPN's fiat amount doesn't match the order's due (net + shipping − credit),
      // flag for review instead of fulfilling — defense-in-depth against a
      // misclassified under-payment. price_amount absent → skip (legacy payloads).
      if (action === "fulfill" && payload.price_amount != null) {
        const dueUsd = Number(order.net_amount ?? 0) + Number(order.shipping_amount ?? 0) - Number(order.credit_applied ?? 0);
        const paidUsd = Number(payload.price_amount);
        if (!Number.isFinite(paidUsd) || Math.abs(paidUsd - dueUsd) > 0.01) {
          try {
            if (!order.emails_sent?.admin_late_payment) {
              const note = `⚠️ NowPayments IPN "${status}" reports price_amount $${payload.price_amount} but the order is due $${dueUsd.toFixed(2)} — NOT fulfilled. Review before shipping.`;
              await supabaseAdmin.from("orders")
                .update({ admin_notes: order.admin_notes ? `${order.admin_notes}\n\n${note}` : note })
                .eq("id", payload.order_id);
              await sendOrderEvent(order as EmailOrder, "admin_late_payment");
            }
          } catch (err) {
            console.error("Failed to flag amount mismatch:", err);
          }
          res.status(200).send("OK");
          return;
        }
      }

      // Confirm the order exactly once (NowPayments fires both `confirmed`
      // and `finished` for the same payment). confirmPaidOrder atomically claims
      // the pending→confirmed transition, so parallel IPNs can't double-decrement
      // stock or double-count the promo — a duplicate is a no-op.
      let claimed = false;
      try {
        if (action === "fulfill") {
          claimed = await confirmPaidOrder(order, {
            payCurrency: payload.pay_currency ?? null,
            payAmount: payload.actually_paid ?? payload.pay_amount ?? null,
            paymentId: payload.payment_id != null ? String(payload.payment_id) : null,
          });
        }
      } catch (err) {
        console.error("Failed to update order/stock:", err);
      }

      // Only email "confirmed" when the order really IS confirmed. A fulfill
      // attempt that lost its claim may have lost to a duplicate IPN (fine —
      // resend idempotently) or to the hourly expiry cancelling the order right
      // as the payment landed (NOT fine — alert the admin, don't tell the
      // customer their cancelled order is confirmed).
      let emailable = action === "resend_emails" || claimed;
      if (action === "fulfill" && !claimed) {
        const { data: now } = await supabaseAdmin.from("orders").select("status").eq("id", payload.order_id).maybeSingle();
        emailable = now?.status === "confirmed" || now?.status === "finished";
        if (!emailable) {
          await recordLatePayment(order, {
            payCurrency: payload.pay_currency ?? null,
            payAmount: payload.actually_paid ?? payload.pay_amount ?? null,
            paymentId: payload.payment_id != null ? String(payload.payment_id) : null,
          }, `⚠️ NowPayments "${status}" payment landed while this order was being ${now?.status ?? "removed"} (expiry race). Not fulfilled automatically — refund or fulfill manually.`).catch((err) => console.error("Failed to flag expiry race:", err));
        }
      }

      // Emails are idempotent via orders.emails_sent — safe across duplicate IPNs.
      if (emailable) {
        try {
          await sendOrderEvent(order as EmailOrder, "confirmed");
          await sendOrderEvent(order as EmailOrder, "admin_new_order");
          await notifyAffiliate(order);
        } catch (err) {
          console.error("Failed to send confirmation emails:", err);
        }
      }
    }

    if ((status === "failed" || status === "expired" || status === "refunded") && order.status === "pending") {
      try {
        await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", payload.order_id);
        // Free the promo/referral one-use slot right away (not just via the hourly
        // sweep) so the customer can retry checkout with the same code immediately.
        await releaseDiscountRedemption(payload.order_id).catch(() => {});
        await sendOrderEvent(order as EmailOrder, "failed");
      } catch (err) {
        console.error("Failed to process failed payment:", err);
      }
    }

    // A refund on an already-confirmed order → claw it back (revert to cancelled
    // so rewards, commission, and referral credit are reversed). Idempotent.
    if (status === "refunded" && (order.status === "confirmed" || order.status === "finished")) {
      try {
        await refundClawback(order, `Refunded via NowPayments (IPN "${status}")`);
      } catch (err) {
        console.error("Failed to process refund clawback:", err);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(400).send("Bad request");
  }
}
