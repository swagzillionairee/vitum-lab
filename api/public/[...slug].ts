import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { isSitewideActive } from "../_lib/pricing.js";

// Public (no-auth) reads: the site-wide sale banner + customer order tracking.
// Consolidated into one catch-all to stay within the Vercel function limit.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/public\/?/, "").split("/")[0];

  // ── /api/public/site — public store config (drives the site-wide sale banner) ──
  if (route === "site") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const { data: s } = await supabaseAdmin.from("store_settings").select("*").maybeSingle();
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.json({
      sitewide: isSitewideActive(s)
        ? {
            active: true,
            percent: Number(s!.sitewide_percent),
            label: (s!.sitewide_label as string | null) ?? null,
            ends_at: (s!.sitewide_ends_at as string | null) ?? null,
          }
        : { active: false },
      quantity_tiers: (s?.quantity_tiers as { min_qty: number; percent: number }[] | null) ?? [],
    });
  }

  // ── /api/public/track?order=ID&email=EMAIL — public order tracking ──────────
  if (route === "track") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const orderId = String(req.query?.order ?? "").trim();
    const email = String(req.query?.email ?? "").trim().toLowerCase();
    if (!orderId || !email) return res.status(400).json({ error: "Order number and email are required." });

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, email, items, net_amount, status, fulfillment_status, tracking_number, carrier, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at, cancel_reason",
      )
      .eq("id", orderId)
      .maybeSingle();

    // Generic 404 on a miss OR an email mismatch — never reveal which failed,
    // and require the email to match so an order number alone isn't enough.
    if (!order || String(order.email ?? "").trim().toLowerCase() !== email) {
      return res.status(404).json({ error: "No order found for that order number and email." });
    }

    const { email: _omit, ...safe } = order;
    return res.json({ order: safe });
  }

  return res.status(404).json({ error: "Not found" });
}
