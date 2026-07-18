import crypto from "node:crypto";
import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sendOrderEvent, type EmailOrder } from "./_lib/email.js";
import { paidIpnAction } from "./_lib/orderLifecycle.js";
import { confirmPaidOrder, refundClawback, recordLatePayment, sendConfirmationEmails, ORDER_COLS } from "./_lib/fulfillment.js";
import { releaseDiscountRedemption } from "./_lib/credit.js";
import { estimateNowPaymentUsd, estimatedUsdCoversOrder, verifyNowPayment } from "./_lib/nowPayments.js";
import { orderCashDue } from "./_lib/pricing.js";

function sortKeys(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export const config = { api: { bodyParser: false } };
const MAX_WEBHOOK_BYTES = 1024 * 1024;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    console.error("NOWPAYMENTS_IPN_SECRET is not configured; rejecting webhook");
    return res.status(503).send("Webhook unavailable");
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_WEBHOOK_BYTES) return res.status(413).send("Payload too large");
    chunks.push(buffer);
  }

  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any>;
    const computed = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(sortKeys(payload)))
      .digest("hex");
    const supplied = Buffer.from(String(req.headers["x-nowpayments-sig"] ?? ""));
    const expected = Buffer.from(computed);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(expected, supplied)) {
      return res.status(401).send("Invalid signature");
    }

    const status = String(payload.payment_status ?? "").toLowerCase();
    const orderId = String(payload.order_id ?? "");
    if (!orderId || orderId.length > 64) return res.status(200).send("OK");

    const { data: order } = await supabaseAdmin.from("orders").select(ORDER_COLS).eq("id", orderId).maybeSingle();
    if (!order) return res.status(200).send("OK");

    // `confirmed` only means blockchain confirmation. Fulfillment waits for
    // `finished`, when NOWPayments says funds reached the merchant wallet.
    if (status === "finished") {
      const meta = {
        payCurrency: payload.pay_currency ?? null,
        payAmount: payload.actually_paid ?? payload.pay_amount ?? null,
        paymentId: payload.payment_id != null ? String(payload.payment_id) : null,
      };
      const amountCheck = verifyNowPayment(payload, order);
      if (!amountCheck.ok) {
        await recordLatePayment(order, meta, `NOWPayments finished payment was not auto-fulfilled: ${amountCheck.reason} Review the signed payment before shipping.`).catch(error => console.error("Failed to flag payment mismatch:", error));
        return res.status(200).send("OK");
      }
      const estimatedUsd = await estimateNowPaymentUsd(payload, process.env.NOWPAYMENTS_API_KEY ?? "").catch(() => null);
      const dueUsd = orderCashDue(order.net_amount, order.shipping_amount, order.credit_applied);
      if (!estimatedUsdCoversOrder(estimatedUsd, dueUsd)) {
        await recordLatePayment(order, meta, `NOWPayments finished payment was not auto-fulfilled because the actually received asset could not be verified at the $${dueUsd.toFixed(2)} order value. Review before shipping.`).catch(() => {});
        return res.status(200).send("OK");
      }

      const action = paidIpnAction(order.status);
      if (action === "late_payment") {
        await recordLatePayment(order, meta, `NOWPayments payment ${payload.payment_id ?? "unknown"} finished after this order became ${order.status}. Refund or fulfill it manually.`).catch(error => console.error("Failed to flag late payment:", error));
        return res.status(200).send("OK");
      }

      let emailable = action === "resend_emails";
      if (action === "fulfill") {
        try {
          emailable = await confirmPaidOrder(order, meta);
        } catch (error) {
          console.error("NOWPayments fulfillment transaction failed:", error);
          await recordLatePayment(order, meta, `NOWPayments payment finished but automatic fulfillment failed: ${error instanceof Error ? error.message : "unknown error"}. Review inventory and fulfill or refund manually.`).catch(() => {});
          return res.status(200).send("OK");
        }
      }

      if (!emailable) {
        const { data: current } = await supabaseAdmin.from("orders").select("status").eq("id", orderId).maybeSingle();
        emailable = current?.status === "confirmed" || current?.status === "finished";
        if (!emailable) {
          await recordLatePayment(order, meta, `NOWPayments payment finished during an order status race (${current?.status ?? "missing"}). Refund or fulfill manually.`).catch(() => {});
        }
      }
      if (emailable) await sendConfirmationEmails(order).catch(error => console.error("Failed to send confirmation emails:", error));
    }

    if ((status === "failed" || status === "expired" || status === "refunded") && order.status === "pending") {
      const { data: claimed } = await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending").select("id").maybeSingle();
      if (claimed) {
        await releaseDiscountRedemption(orderId).catch(() => {});
        await sendOrderEvent(order as EmailOrder, "failed").catch(error => console.error("Failed to send failed-payment email:", error));
      }
    }

    if (status === "refunded" && (order.status === "confirmed" || order.status === "finished")) {
      await refundClawback(order, "Refunded via NOWPayments").catch(error => console.error("Failed to process refund clawback:", error));
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(400).send("Bad request");
  }
}
