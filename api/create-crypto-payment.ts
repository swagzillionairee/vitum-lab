import { customAlphabet } from "nanoid";
import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sendOrderEvent, deferEmail, type EmailOrder } from "./_lib/email.js";
import { grossFromItems, commissionAmount as calcCommission, isFreeOrder, isPromoUsable, promoAlreadyRedeemed, computeStackedDiscounts, type QuantityTier } from "./_lib/pricing.js";

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";
const genId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

function buildOrderId(email: string) {
  return `${genId()}--${Buffer.from(email).toString("base64url")}`;
}

/**
 * Server-side discount resolution — never trust the client's discount math.
 * A code is either an affiliate code (sets affiliate + commission) or a row
 * in promo_codes (validated for active/expiry/uses/min-subtotal).
 */
async function resolveDiscount(code: string, gross: number): Promise<
  | { kind: "affiliate"; percent: number; affiliateId: string; commissionPercent: number }
  | { kind: "promo"; percent: number }
  | null
> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("id, discount_percent, commission_percent")
    .eq("code", normalized)
    .maybeSingle();
  if (aff) return { kind: "affiliate", percent: aff.discount_percent, affiliateId: aff.id, commissionPercent: aff.commission_percent };

  const { data: promo } = await supabaseAdmin
    .from("promo_codes")
    .select("code, percent_off, min_subtotal, max_uses, used_count, starts_at, expires_at, is_active")
    .ilike("code", normalized)
    .maybeSingle();
  if (!promo || !isPromoUsable(promo, gross)) return null;
  return { kind: "promo", percent: promo.percent_off };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { items, email, discountCode, shipping } = req.body as {
      items: { name: string; dose: string; quantity: number; cartCode: string; price: number }[];
      email: string;
      total: number;
      discountCode?: string;
      affiliateId?: string;
      discountAmount?: number;
      shipping?: {
        name: string; line1: string; line2?: string; city: string;
        state: string; postal_code: string; country: string; phone?: string;
      };
    };

    if (!items?.length || !email) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (!shipping?.name || !shipping?.line1 || !shipping?.city || !shipping?.state || !shipping?.postal_code) {
      res.status(400).json({ error: "A complete shipping address is required" });
      return;
    }

    // Validate stock for each item (skip free gifts with price 0)
    const paidItems = items.filter((i) => i.price > 0 && i.cartCode !== "bac-water-free");
    for (const item of paidItems) {
      const { data } = await supabaseAdmin
        .from("inventory")
        .select("stock")
        .eq("cart_code", item.cartCode)
        .maybeSingle();

      if (data && data.stock < item.quantity) {
        res.status(409).json({ error: `${item.name} ${item.dose} is out of stock.` });
        return;
      }
    }

    const orderId = buildOrderId(email);
    const grossAmount = grossFromItems(items);

    // Recompute discount + commission server-side from the code itself.
    const discount = discountCode ? await resolveDiscount(discountCode, grossAmount) : null;
    if (discountCode && !discount) {
      res.status(400).json({ error: "That promo code is invalid or expired." });
      return;
    }
    const discountCodeNorm = discount ? discountCode!.trim().toUpperCase() : null;

    // Promo codes are limited to one use per customer (affiliate codes are exempt).
    // Codes are A–Z0–9 so ILIKE on the code is safe; the exact email match is done
    // in JS (emails can contain ILIKE wildcards like "_").
    if (discount?.kind === "promo") {
      const { data: prior } = await supabaseAdmin
        .from("orders")
        .select("email, discount_code")
        .ilike("discount_code", discountCodeNorm!)
        .in("status", ["confirmed", "finished"]);
      if (promoAlreadyRedeemed(prior ?? [], email, discountCodeNorm!)) {
        res.status(400).json({ error: "You've already used this promo code — it's limited to one use per customer." });
        return;
      }
    }

    // Quantity-tier discount (admin-configurable) stacks with the code discount:
    // the tier % comes off first, then the code % off the remainder.
    const units = paidItems.reduce((sum, i) => sum + i.quantity, 0);
    const { data: settings } = await supabaseAdmin.from("store_settings").select("quantity_tiers").maybeSingle();
    const tiers = (settings?.quantity_tiers as QuantityTier[] | null) ?? [];
    const codeArg = discount
      ? {
          kind: discount.kind,
          label: discount.kind === "affiliate" ? `Affiliate (${discountCodeNorm})` : `Promo (${discountCodeNorm})`,
          percent: discount.percent,
        }
      : null;
    const { lines: discountLines, totalDiscount: discountAmount, net: netAmount } = computeStackedDiscounts({
      gross: grossAmount,
      units,
      tiers,
      code: codeArg,
    });
    const affiliateId = discount?.kind === "affiliate" ? discount.affiliateId : null;
    const commissionAmount =
      discount?.kind === "affiliate" ? calcCommission(netAmount, discount.commissionPercent) : null;

    const description = paidItems
      .map((i) => `${i.name} ${i.dose} x${i.quantity}`)
      .join(", ");
    const baseUrl = process.env.BASE_URL || "https://vitum-lab.vercel.app";
    const orderItems = items.map((i) => ({ name: i.name, dose: i.dose, quantity: i.quantity, cartCode: i.cartCode, price: i.price }));

    // ── Free order ($0 due, e.g. a 100% promo) — confirm now, skip NowPayments ──
    // A $0 invoice would be rejected by NowPayments anyway, and there's nothing
    // to pay, so we mark the order confirmed and decrement stock immediately
    // (no IPN webhook will fire for it).
    if (isFreeOrder(netAmount)) {
      const { error: insertError } = await supabaseAdmin.from("orders").insert({
        id: orderId,
        email,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        items: orderItems,
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        net_amount: netAmount,
        discount_code: discountCodeNorm,
        discount_breakdown: discountLines,
        affiliate_id: affiliateId,
        commission_amount: commissionAmount,
        shipping_address: shipping,
        pay_amount: 0,
      });
      if (insertError) {
        console.error("Free order insert failed:", insertError);
        res.status(500).json({ error: "Failed to create order. Please try again." });
        return;
      }

      for (const item of paidItems) {
        await supabaseAdmin.rpc("decrement_stock", { p_cart_code: item.cartCode, p_qty: item.quantity });
      }
      if (discountCodeNorm) {
        await supabaseAdmin.rpc("increment_promo_use", { p_code: discountCodeNorm }).then(() => {}, () => {});
      }

      const freeOrder: EmailOrder = {
        id: orderId, email, items, gross_amount: grossAmount, discount_amount: discountAmount,
        discount_code: discountCodeNorm, net_amount: netAmount, shipping_address: shipping, emails_sent: {},
      };
      deferEmail(
        (async () => {
          await sendOrderEvent(freeOrder, "confirmed");
          await sendOrderEvent(freeOrder, "admin_new_order");
        })(),
      );

      res.status(200).json({ free: true, orderId });
      return;
    }

    // Persist pending order
    const { error: insertError } = await supabaseAdmin.from("orders").insert({
      id: orderId,
      email,
      status: "pending",
      items: orderItems,
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      net_amount: netAmount,
      discount_code: discountCodeNorm,
      discount_breakdown: discountLines,
      affiliate_id: affiliateId,
      commission_amount: commissionAmount,
      shipping_address: shipping,
    });
    if (insertError) {
      console.error("Order insert failed:", insertError);
      res.status(500).json({ error: "Failed to create order. Please try again." });
      return;
    }

    const nowRes = await fetch(`${NOWPAYMENTS_API}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: netAmount,
        price_currency: "usd",
        order_id: orderId,
        order_description: description,
        ipn_callback_url: `${baseUrl}/api/nowpayments-webhook`,
        success_url: `${baseUrl}/order-success?order=${orderId}`,
        cancel_url: `${baseUrl}/order-cancel`,
        is_fixed_rate: false,
        is_fee_paid_by_user: false,
      }),
    });

    if (!nowRes.ok) {
      console.error("NowPayments error:", await nowRes.text());
      res.status(500).json({ error: "Failed to create payment" });
      return;
    }

    const data = await nowRes.json() as { invoice_url: string };

    // "Order received / awaiting payment" email — after the response via waitUntil.
    const emailOrder: EmailOrder = {
      id: orderId,
      email,
      items,
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      discount_code: discountCodeNorm,
      net_amount: netAmount,
      shipping_address: shipping,
      emails_sent: {},
    };
    deferEmail(sendOrderEvent(emailOrder, "order_created", { invoiceUrl: data.invoice_url }));

    res.status(200).json({ invoiceUrl: data.invoice_url, orderId });
  } catch (err) {
    console.error("create-crypto-payment error:", err);
    res.status(500).json({ error: "Failed to create payment. Please try again." });
  }
}
