import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { clientIp } from "./_lib/clientIp.js";

/**
 * GET  /api/inventory → { cartCode: stock } map (public, cached).
 * POST /api/inventory → join the back-in-stock waitlist for a cartCode
 *                       (public; body { cartCode, email }).
 */
export default async function handler(req: any, res: any) {
  if (req.method === "POST") {
    const { cartCode, email } = (req.body ?? {}) as { cartCode?: string; email?: string };
    if (
      typeof cartCode !== "string" || !cartCode.trim() || cartCode.length > 100 ||
      typeof email !== "string" || email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ) {
      res.status(400).json({ error: "A valid email and cartCode are required" });
      return;
    }

    const normalizedCartCode = cartCode.trim();
    const targetEmail = email.toLowerCase().trim();

    // Throttle both the trusted client IP and the target email. This endpoint's
    // rows later trigger mail, so both many-victim and one-victim abuse matter.
    const ip = clientIp(req);
    try {
      const [ipHit, emailHit] = await Promise.all([
        supabaseAdmin.rpc("rate_limit_hit", {
          p_bucket: `waitlist:ip:${ip}`,
          p_max: 5,
          p_window_seconds: 600,
        }),
        supabaseAdmin.rpc("rate_limit_hit", {
          p_bucket: `waitlist:email:${targetEmail}`,
          p_max: 5,
          p_window_seconds: 3600,
        }),
      ]);
      if (ipHit.error || emailHit.error || ipHit.data !== true || emailHit.data !== true) {
        if (ipHit.error || emailHit.error) {
          res.status(503).json({ error: "Waitlist protection is temporarily unavailable. Please try again shortly." });
          return;
        }
        res.status(429).json({ error: "Too many requests — please try again in a few minutes." });
        return;
      }
    } catch (err) {
      console.error("waitlist rate-limit check failed:", err);
      res.status(503).json({ error: "Waitlist protection is temporarily unavailable. Please try again shortly." });
      return;
    }

    // Only accept real variants — otherwise arbitrary junk rows accrue forever.
    const { data: variant } = await supabaseAdmin
      .from("inventory")
      .select("cart_code")
      .eq("cart_code", normalizedCartCode)
      .maybeSingle();
    if (!variant) {
      res.status(400).json({ error: "Unknown product." });
      return;
    }

    const { error } = await supabaseAdmin
      .from("stock_waitlist")
      .upsert(
        { cart_code: normalizedCartCode, email: targetEmail, notified_at: null },
        { onConflict: "cart_code,email" },
      );
    if (error) {
      console.error("waitlist upsert error:", error);
      res.status(500).json({ error: "Failed to join the waitlist" });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("inventory")
      .select("cart_code, stock");

    if (error) throw error;

    const inventory: Record<string, number> = {};
    for (const row of data ?? []) {
      // Cap the public figure at 50 — the storefront already displays "50+",
      // and exact counts let anyone diff snapshots to read sales velocity.
      inventory[row.cart_code] = Math.min(Number(row.stock) || 0, 50);
    }

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    res.status(200).json(inventory);
  } catch (err) {
    console.error("inventory error:", err);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
}
