import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sendOrderEvent, deferEmail, type EmailOrder } from "./_lib/email.js";
import { grossFromItems, commissionAmount as calcCommission, isFreeOrder, applyCredit, isPromoUsable, promoAlreadyRedeemed, computeStackedDiscounts, sitewideSalePrice, isSitewideActive, type QuantityTier } from "./_lib/pricing.js";
import { getBalance, reserveCredit, getRewardConfig, earnLoyalty, grantReferralReward, type RewardConfig } from "./_lib/credit.js";
import { validateAddress } from "./_lib/shippo.js";
import { buildOrderId } from "./_lib/orderId.js";
import { requireUser } from "./_lib/requireUser.js";

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";

const FREE_GIFT_CODE = "bac-water-free";
const FREE_GIFT_THRESHOLD = 150; // paid subtotal that unlocks the free BAC Water

/**
 * Authoritative per-variant prices, keyed by cartCode, read from the products
 * table — NEVER trust the client's `price` (the cart lives in the browser). The
 * effective price mirrors the storefront (/api/products + dbRowToProduct): the
 * active site-wide sale overrides everything, else a valid per-variant sale
 * price, else the base price.
 */
async function loadCatalog(): Promise<Record<string, { name: string; dose: string; price: number }>> {
  const [{ data: products }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("products").select("name, variants"),
    supabaseAdmin
      .from("store_settings")
      .select("sitewide_active, sitewide_percent, sitewide_starts_at, sitewide_ends_at")
      .maybeSingle(),
  ]);

  const sitewidePct = isSitewideActive(settings) ? Number(settings!.sitewide_percent) : null;
  const now = new Date();
  const map: Record<string, { name: string; dose: string; price: number }> = {};

  for (const p of products ?? []) {
    const variants = (p.variants as { cart_code?: string; dose?: string; price?: number; sale_price?: number | null; sale_ends_at?: string | null }[]) ?? [];
    for (const v of variants) {
      if (!v.cart_code) continue;
      const base = Number(v.price) || 0;
      let price = base;
      if (sitewidePct != null) {
        price = sitewideSalePrice(base, sitewidePct);
      } else {
        const sale = v.sale_price != null ? Number(v.sale_price) : null;
        const endsAt = v.sale_ends_at ? new Date(v.sale_ends_at) : null;
        if (sale != null && sale < base && (endsAt == null || endsAt > now)) price = sale;
      }
      map[v.cart_code] = { name: p.name as string, dose: v.dose ?? "", price };
    }
  }
  return map;
}

/**
 * Server-side discount resolution — never trust the client's discount math.
 * A code is either an affiliate code (sets affiliate + commission) or a row
 * in promo_codes (validated for active/expiry/uses/min-subtotal).
 */
async function resolveDiscount(code: string, gross: number, email: string, cfg: RewardConfig): Promise<
  | { kind: "affiliate"; percent: number; affiliateId: string; commissionPercent: number }
  | { kind: "promo"; percent: number }
  | { kind: "referral"; amountOff: number; referrerEmail: string }
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
  if (promo) return isPromoUsable(promo, gross) ? { kind: "promo", percent: promo.percent_off } : null;

  // Referral code (customer-to-customer): a flat $ off for a NEW referee only.
  const { data: ref } = await supabaseAdmin.from("referral_codes").select("code, email").eq("code", normalized).maybeSingle();
  if (ref) {
    if ((ref.email || "").toLowerCase() === email.toLowerCase()) return null; // no self-referral
    if (gross < cfg.referralMinSubtotal) return null;
    const { data: prior } = await supabaseAdmin
      .from("orders").select("id").ilike("email", email).in("status", ["confirmed", "finished"]).limit(1);
    if (prior && prior.length > 0) return null; // referral discount is first-order only
    return { kind: "referral", amountOff: cfg.refereeAmount, referrerEmail: ref.email };
  }
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Checkout requires a signed-in customer. The order email — which drives store
  // credit, loyalty, referrals, and order-history matching — comes from the
  // validated JWT, NEVER the request body, so nobody can place an order as
  // another customer or spend someone else's store credit.
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: "Please sign in to place an order." });
    return;
  }
  const email = user.email;

  try {
    const { items, discountCode, shipping, attestation } = req.body as {
      items: { name: string; dose: string; quantity: number; cartCode: string; price: number }[];
      total: number;
      discountCode?: string;
      affiliateId?: string;
      discountAmount?: number;
      attestation?: boolean;
      shipping?: {
        name: string; line1: string; line2?: string; city: string;
        state: string; postal_code: string; country: string; phone?: string;
      };
    };

    if (!items?.length) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Require the research-use / age acknowledgment from checkout.
    if (!attestation) {
      res.status(400).json({ error: "A research-use acknowledgment is required to place an order." });
      return;
    }

    if (!shipping?.name || !shipping?.line1 || !shipping?.city || !shipping?.state || !shipping?.postal_code) {
      res.status(400).json({ error: "A complete shipping address is required" });
      return;
    }

    // Verify the address is deliverable (best-effort — never blocks on a Shippo
    // outage; only rejects when Shippo definitively flags it invalid).
    const addrCheck = await validateAddress(shipping);
    if (addrCheck && !addrCheck.valid) {
      res.status(400).json({ error: `We couldn't verify that shipping address. ${addrCheck.messages[0] || "Please double-check it and try again."}` });
      return;
    }

    // ── Re-price every line item SERVER-SIDE from the catalog. The client's
    // `price` is ignored entirely (the cart is browser state); price, name, and
    // dose come from the products table. The free gift is re-added at $0 only
    // when the order actually qualifies — never taken from the request. ──
    const catalog = await loadCatalog();
    const paidItems: { name: string; dose: string; quantity: number; cartCode: string; price: number }[] = [];
    for (const i of items) {
      if (i.cartCode === FREE_GIFT_CODE) continue; // re-derived below, not trusted
      const entry = catalog[i.cartCode];
      if (!entry) {
        res.status(400).json({ error: `Unknown product in cart: ${i.cartCode}` });
        return;
      }
      const quantity = Math.max(1, Math.floor(Number(i.quantity) || 0));
      paidItems.push({ name: entry.name, dose: entry.dose, quantity, cartCode: i.cartCode, price: entry.price });
    }
    if (paidItems.length === 0) {
      res.status(400).json({ error: "Your cart has no purchasable items." });
      return;
    }

    // Validate stock for each paid item.
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

    const orderId = buildOrderId();
    const grossAmount = grossFromItems(paidItems);

    // Re-add the free BAC Water ($0, qty 1) only when the paid subtotal clears
    // the threshold — server-authoritative mirror of the cart's auto-gift.
    const wantsFreeGift = items.some((i) => i.cartCode === FREE_GIFT_CODE);
    const orderItems = wantsFreeGift && grossAmount >= FREE_GIFT_THRESHOLD
      ? [...paidItems, { name: "BAC Water (Free Gift)", dose: "10 ML", quantity: 1, cartCode: FREE_GIFT_CODE, price: 0 }]
      : paidItems;

    // Reward config (loyalty % + referral amounts) — admin-adjustable.
    const cfg = await getRewardConfig();

    // Recompute discount + commission server-side from the code itself.
    const discount = discountCode ? await resolveDiscount(discountCode, grossAmount, email, cfg) : null;
    if (discountCode && !discount) {
      res.status(400).json({ error: "That code is invalid, expired, or not eligible." });
      return;
    }
    const discountCodeNorm = discount ? discountCode!.trim().toUpperCase() : null;
    const referralCode = discount?.kind === "referral" ? discountCodeNorm : null;

    // Promo codes are limited to one use per customer (affiliate/referral exempt).
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
    // the tier % comes off first, then the code (promo/affiliate % or referral $)
    // off the remainder.
    const units = paidItems.reduce((sum, i) => sum + i.quantity, 0);
    const { data: settings } = await supabaseAdmin.from("store_settings").select("quantity_tiers").maybeSingle();
    const tiers = (settings?.quantity_tiers as QuantityTier[] | null) ?? [];
    const codeArg = discount
      ? discount.kind === "referral"
        ? { kind: "referral" as const, label: `Referral (${discountCodeNorm})`, amount: discount.amountOff }
        : {
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

    // Apply store credit as tender: it reduces the cash amount due (net_amount is
    // the order's value after discounts; credit is a payment method, not a discount).
    const balance = await getBalance(email);
    const { creditApplied, amountDue } = applyCredit(netAmount, balance);

    const description = paidItems
      .map((i) => `${i.name} ${i.dose} x${i.quantity}`)
      .join(", ");
    const baseUrl = process.env.BASE_URL || "https://vitumlab.com";

    // ── Nothing due ($0 — covered by discounts and/or store credit): confirm now,
    // skip NowPayments (a $0 invoice would be rejected anyway; no IPN will fire). ──
    if (isFreeOrder(amountDue)) {
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
        referral_code: referralCode,
        credit_applied: creditApplied,
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

      // Atomic reservation — refuses if a concurrent order spent the credit,
      // in which case this order is no longer actually fully covered.
      if (!(await reserveCredit(email, creditApplied, orderId))) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        res.status(409).json({ error: "Your store credit balance changed — please review your order and try again." });
        return;
      }
      for (const item of paidItems) {
        await supabaseAdmin.rpc("decrement_stock", { p_cart_code: item.cartCode, p_qty: item.quantity });
      }
      if (discountCodeNorm) {
        await supabaseAdmin.rpc("increment_promo_use", { p_code: discountCodeNorm }).then(() => {}, () => {});
      }
      // Confirmed now → earn loyalty + grant the referrer's reward (idempotent).
      const rewardOrder = { id: orderId, email, net_amount: netAmount, credit_applied: creditApplied, referral_code: referralCode };
      await earnLoyalty(rewardOrder, cfg.loyaltyPercent);
      await grantReferralReward(rewardOrder, cfg.referrerAmount);

      const freeOrder: EmailOrder = {
        id: orderId, email, items: orderItems, gross_amount: grossAmount, discount_amount: discountAmount,
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
      referral_code: referralCode,
      credit_applied: creditApplied,
      affiliate_id: affiliateId,
      commission_amount: commissionAmount,
      shipping_address: shipping,
    });
    if (insertError) {
      console.error("Order insert failed:", insertError);
      res.status(500).json({ error: "Failed to create order. Please try again." });
      return;
    }
    // Reserve the store credit now (atomic — refuses if a concurrent order
    // already spent it); failing the order (below, or on auto-expiry) releases
    // it automatically via the balance query.
    if (!(await reserveCredit(email, creditApplied, orderId))) {
      await supabaseAdmin.from("orders").delete().eq("id", orderId);
      res.status(409).json({ error: "Your store credit balance changed — please review your order and try again." });
      return;
    }

    const nowRes = await fetch(`${NOWPAYMENTS_API}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: amountDue,
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
      // Release the reserved credit by failing the order.
      await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderId);
      res.status(500).json({ error: "Failed to create payment" });
      return;
    }

    const data = await nowRes.json() as { invoice_url: string };

    // "Order received / awaiting payment" email — after the response via waitUntil.
    const emailOrder: EmailOrder = {
      id: orderId,
      email,
      items: orderItems,
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
