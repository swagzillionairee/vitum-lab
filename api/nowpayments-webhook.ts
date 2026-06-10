import crypto from "node:crypto";
import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sendOrderEvent, sendAffiliateCommission, type EmailOrder } from "./_lib/email.js";
import { getRewardConfig, earnLoyalty, grantReferralReward } from "./_lib/credit.js";

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
  "id, email, items, gross_amount, discount_amount, discount_code, net_amount, credit_applied, referral_code, shipping_address, status, affiliate_id, commission_amount, emails_sent";

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
      // Confirm the order exactly once (NowPayments fires both `confirmed`
      // and `finished` for the same payment).
      try {
        if (order.status === "pending") {
          const items = (order.items as { cartCode: string; quantity: number; price: number }[]) ?? [];
          for (const item of items) {
            if (item.price > 0 && item.cartCode !== "bac-water-free") {
              await supabaseAdmin.rpc("decrement_stock", {
                p_cart_code: item.cartCode,
                p_qty: item.quantity,
              });
            }
          }

          await supabaseAdmin
            .from("orders")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
              pay_currency: payload.pay_currency ?? null,
              pay_amount: payload.actually_paid ?? payload.pay_amount ?? null,
              payment_id: payload.payment_id != null ? String(payload.payment_id) : null,
            })
            .eq("id", payload.order_id);

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
            await earnLoyalty(order as { id: string; email: string; net_amount: number; credit_applied?: number | null }, cfg.loyaltyPercent);
            await grantReferralReward(order as { id: string; email: string; referral_code?: string | null }, cfg.referrerAmount);
          } catch (err) {
            console.error("Failed to apply loyalty/referral rewards:", err);
          }
        }
      } catch (err) {
        console.error("Failed to update order/stock:", err);
      }

      // Emails are idempotent via orders.emails_sent — safe across duplicate IPNs.
      try {
        await sendOrderEvent(order as EmailOrder, "confirmed");
        await sendOrderEvent(order as EmailOrder, "admin_new_order");
        await notifyAffiliate(order);
      } catch (err) {
        console.error("Failed to send confirmation emails:", err);
      }
    }

    if ((status === "failed" || status === "expired" || status === "refunded") && order.status === "pending") {
      try {
        await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", payload.order_id);
        await sendOrderEvent(order as EmailOrder, "failed");
      } catch (err) {
        console.error("Failed to process failed payment:", err);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(400).send("Bad request");
  }
}
