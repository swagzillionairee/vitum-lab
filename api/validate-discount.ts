import { supabaseAdmin } from "./_lib/supabase-admin.js";

/**
 * Validates a discount code: either an affiliate code (affiliates table) or
 * a general promo code (promo_codes table — active, unexpired, under its use
 * cap, and meeting any minimum subtotal). The checkout sends `subtotal` so
 * min-subtotal promos validate correctly; create-crypto-payment re-validates
 * server-side regardless.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code, subtotal } = req.body as { code?: string; subtotal?: number };
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
      .select("percent_off, min_subtotal, max_uses, used_count, expires_at, is_active")
      .ilike("code", normalized)
      .maybeSingle();

    if (
      promo &&
      promo.is_active &&
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
      res.status(200).json({ valid: true, discountPct: promo.percent_off });
      return;
    }

    res.status(404).json({ valid: false, error: "Invalid or expired promo code." });
  } catch (err) {
    console.error("validate-discount error:", err);
    res.status(500).json({ error: "Failed to validate code" });
  }
}
