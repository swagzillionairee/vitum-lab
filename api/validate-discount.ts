import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { promoAlreadyRedeemed } from "./_lib/pricing.js";

/**
 * Validates a discount code: either an affiliate code (affiliates table) or
 * a general promo code (promo_codes table — active, unexpired, under its use
 * cap, meeting any minimum subtotal, and not already redeemed by this customer
 * — promos are one use per customer). The checkout sends `subtotal` + `email`;
 * create-crypto-payment re-validates server-side regardless.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code, subtotal, email } = req.body as { code?: string; subtotal?: number; email?: string };
  if (!code?.trim()) {
    res.status(400).json({ error: "Code is required" });
    return;
  }
  const normalized = code.trim().toUpperCase();

  try {
    const { data: aff, error } = await supabaseAdmin
      .from("affiliates")
      .select("id, code, discount_percent")
      .eq("code", normalized)
      .maybeSingle();
    if (error) throw error;
    if (aff) {
      res.status(200).json({ valid: true, discountPct: aff.discount_percent, affiliateId: aff.id });
      return;
    }

    const { data: promo } = await supabaseAdmin
      .from("promo_codes")
      .select("percent_off, min_subtotal, max_uses, used_count, starts_at, expires_at, is_active")
      .ilike("code", normalized)
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
      // One use per customer — reject if this email already redeemed it (paid).
      if (typeof email === "string" && email.includes("@")) {
        const { data: prior } = await supabaseAdmin
          .from("orders")
          .select("email, discount_code")
          .ilike("discount_code", normalized)
          .in("status", ["confirmed", "finished"]);
        if (promoAlreadyRedeemed(prior ?? [], email, normalized)) {
          res.status(400).json({ valid: false, error: "You've already used this code — it's limited to one use per customer." });
          return;
        }
      }
      res.status(200).json({ valid: true, discountPct: promo.percent_off });
      return;
    }

    res.status(404).json({ valid: false, error: "Invalid or expired promo code." });
  } catch (err) {
    console.error("validate-discount error:", err);
    res.status(500).json({ error: "Failed to validate code" });
  }
}
