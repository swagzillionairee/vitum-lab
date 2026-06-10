import { supabaseAdmin } from "./_lib/supabase-admin.js";

/**
 * GET  /api/inventory → { cartCode: stock } map (public, cached).
 * POST /api/inventory → join the back-in-stock waitlist for a cartCode
 *                       (public; body { cartCode, email }).
 */
export default async function handler(req: any, res: any) {
  if (req.method === "POST") {
    const { cartCode, email } = (req.body ?? {}) as { cartCode?: string; email?: string };
    if (!cartCode || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.status(400).json({ error: "A valid email and cartCode are required" });
      return;
    }
    const { error } = await supabaseAdmin
      .from("stock_waitlist")
      .upsert(
        { cart_code: cartCode, email: email.toLowerCase().trim(), notified_at: null },
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
      inventory[row.cart_code] = row.stock;
    }

    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    res.status(200).json(inventory);
  } catch (err) {
    console.error("inventory error:", err);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
}
