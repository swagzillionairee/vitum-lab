import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { promoRedemptionCount } from "./_lib/pricing.js";
import { getRewardConfig } from "./_lib/credit.js";
import { requireUser } from "./_lib/requireUser.js";

/**
 * Validates a discount code: either an affiliate code (affiliates table) or
 * a general promo code (promo_codes table — active, unexpired, under its use
 * cap, meeting any minimum subtotal, and not already redeemed by this customer
 * — promos are one use per customer). Auth is required: the email used for the
 * one-use / first-order checks comes from the JWT (not the body), so a code
 * can't be used to probe another customer's order history. The checkout sends
 * `subtotal`; create-crypto-payment re-validates server-side regardless.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: "Please sign in to apply a code." });
    return;
  }
  const email = user.email;

  // This endpoint's valid/invalid split is a discount-code oracle. Bound brute
  // force work per verified account and fail closed if abuse protection is down.
  try {
    const { data: allowed, error } = await supabaseAdmin.rpc("rate_limit_hit", {
      p_bucket: `validate-discount:${user.id}`,
      p_max: 20,
      p_window_seconds: 600,
    });
    if (error || allowed !== true) {
      res.status(error ? 503 : 429).json({
        error: error
          ? "Discount validation is temporarily unavailable. Please try again shortly."
          : "Too many attempts — please wait a few minutes and try again.",
      });
      return;
    }
  } catch (err) {
    console.error("validate-discount rate-limit check failed:", err);
    res.status(503).json({ error: "Discount validation is temporarily unavailable. Please try again shortly." });
    return;
  }

  const { code, subtotal } = (req.body ?? {}) as { code?: string; subtotal?: number };
  if (typeof code !== "string" || !code.trim() || code.length > 64) {
    res.status(400).json({ error: "Code is required" });
    return;
  }
  if (subtotal != null && (typeof subtotal !== "number" || !Number.isFinite(subtotal) || subtotal < 0 || subtotal > 1_000_000)) {
    res.status(400).json({ error: "Subtotal is invalid" });
    return;
  }
  const normalized = code.trim().toUpperCase();

  try {
    const { data: aff, error } = await supabaseAdmin
      .from("affiliates")
      .select("id, code, discount_percent, is_referral, email, user_id")
      .eq("code", normalized)
      .maybeSingle();
    if (error) throw error;
    if (aff) {
      // Self-serve referral codes can't be redeemed by the person they belong to
      // (anti-self-referral). Mirror the checkout guard: block on the account OR
      // the email — the code is locked to both. Reject in the UI so it never
      // even applies, rather than only failing at the final charge.
      if (aff.is_referral) {
        const sameEmail = (aff.email || "").toLowerCase() === email.toLowerCase();
        const sameAccount = !!aff.user_id && aff.user_id === user.id;
        if (sameEmail || sameAccount) {
          res.status(400).json({ valid: false, error: "You can't use your own referral code." });
          return;
        }
      }
      res.status(200).json({ valid: true, discountPct: aff.discount_percent, affiliateId: aff.id });
      return;
    }

    const { data: promo } = await supabaseAdmin
      .from("promo_codes")
      .select("percent_off, min_subtotal, max_uses, used_count, starts_at, expires_at, is_active, created_at, per_customer_limit")
      .eq("code", normalized)
      .maybeSingle();

    if (
      promo &&
      promo.is_active &&
      (!promo.starts_at || new Date(promo.starts_at) <= new Date()) &&
      (!promo.expires_at || new Date(promo.expires_at) > new Date()) &&
      (promo.max_uses == null || promo.used_count < promo.max_uses)
    ) {
      if (typeof subtotal === "number" && subtotal < Number(promo.min_subtotal || 0)) {
        res.status(400).json({
          valid: false,
          error: `This code requires a minimum subtotal of $${Number(promo.min_subtotal).toFixed(2)}.`,
        });
        return;
      }
      // Per-customer usage cap (default 1; 0 = unlimited). Counted only since the
      // promo's created_at, so deleting + recreating the code resets it.
      const perCustomerLimit = promo.per_customer_limit == null ? 1 : Number(promo.per_customer_limit);
      if (perCustomerLimit > 0) {
        const { data: prior } = await supabaseAdmin
          .from("orders")
          .select("email, discount_code")
          .ilike("discount_code", normalized)
          .in("status", ["confirmed", "finished"])
          .gte("created_at", promo.created_at ?? "1970-01-01T00:00:00Z");
        if (promoRedemptionCount(prior ?? [], email, normalized) >= perCustomerLimit) {
          res.status(400).json({
            valid: false,
            error: perCustomerLimit === 1
              ? "You've already used this code — it's limited to one use per customer."
              : `You've reached the ${perCustomerLimit}-use limit for this code.`,
          });
          return;
        }
      }
      res.status(200).json({ valid: true, discountPct: promo.percent_off });
      return;
    }

    // Referral code → a flat $ off for a NEW referee (first order only).
    const { data: ref } = await supabaseAdmin.from("referral_codes").select("email").eq("code", normalized).maybeSingle();
    if (ref) {
      const cfg = await getRewardConfig();
      if (ref.email.toLowerCase() === email.toLowerCase()) {
        res.status(400).json({ valid: false, error: "You can't use your own referral link." });
        return;
      }
      const { data: prior } = await supabaseAdmin
        .from("orders").select("id").eq("email", email).in("status", ["confirmed", "finished"]).limit(1);
      if (prior && prior.length > 0) {
        res.status(400).json({ valid: false, error: "Referral discounts are for first orders only." });
        return;
      }
      if (typeof subtotal === "number" && subtotal < cfg.referralMinSubtotal) {
        res.status(400).json({ valid: false, error: `This referral needs a minimum subtotal of $${Number(cfg.referralMinSubtotal).toFixed(2)}.` });
        return;
      }
      res.status(200).json({ valid: true, discountAmount: cfg.refereeAmount });
      return;
    }

    res.status(404).json({ valid: false, error: "Invalid or expired code." });
  } catch (err) {
    console.error("validate-discount error:", err);
    res.status(500).json({ error: "Failed to validate code" });
  }
}
