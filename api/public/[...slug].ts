import type { VercelRequest, VercelResponse } from "../_lib/http.js";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { isSitewideActive } from "../_lib/pricing.js";
import { clientIp } from "../_lib/clientIp.js";
import { buildPaymentOffer } from "../_lib/paymentConfig.js";

// Public (no-auth) endpoints: the site-wide sale banner and customer order
// tracking. Consolidated into one catch-all to stay within the Vercel function
// limit.
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
      // Configurable pill shown next to the homepage "Featured Products" heading.
      featured_banner:
        s?.featured_banner_active && s?.featured_banner_text
          ? {
              active: true,
              text: s.featured_banner_text as string,
              color: (s.featured_banner_color as string | null) ?? "#7c3aed",
            }
          : { active: false },
      // Self-serve referral program config (drives the public /referral page).
      referral_program: {
        active: !!s?.referral_program_active,
        buyer_discount: Number(s?.referral_buyer_discount ?? 10),
        bounty_amount: Number(s?.referral_bounty_amount ?? 100),
        bounty_orders: Number(s?.referral_bounty_orders ?? 5),
        min_order: Number(s?.referral_min_order ?? 0),
      },
      // Payment methods offered at checkout. A manual method appears only when
      // enabled AND it has a handle to send to; Square appears only when enabled
      // AND its server credentials are present. Handles are public (customers
      // must see them to pay).
      payments: buildPaymentOffer(s?.payment_config),
    });
  }

  // ── /api/public/track?order=ID&email=EMAIL — public order tracking ──────────
  if (route === "track") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const ip = clientIp(req);
    const { data: allowed, error: rateError } = await supabaseAdmin.rpc("rate_limit_hit", {
      p_bucket: `track:${ip}`,
      p_max: 30,
      p_window_seconds: 600,
    });
    if (rateError || allowed !== true) {
      return res.status(rateError ? 503 : 429).json({
        error: rateError ? "Tracking is temporarily unavailable." : "Too many tracking attempts. Please wait and try again.",
      });
    }
    const orderId = String(req.query?.order ?? "").trim();
    const email = String(req.query?.email ?? "")
      .trim()
      .toLowerCase();
    if (!orderId || orderId.length > 64 || !email || email.length > 320) return res.status(400).json({ error: "Order number and email are required." });

    const { data: order } = await supabaseAdmin.from("orders").select("id, email, items, net_amount, shipping_amount, status, fulfillment_status, tracking_number, carrier, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at, cancel_reason").eq("id", orderId).maybeSingle();

    // Generic 404 on a miss OR an email mismatch — never reveal which failed,
    // and require the email to match so an order number alone isn't enough.
    if (
      !order ||
      String(order.email ?? "")
        .trim()
        .toLowerCase() !== email
    ) {
      return res.status(404).json({ error: "No order found for that order number and email." });
    }

    const { email: _omit, ...safe } = order;
    return res.json({ order: safe });
  }

  return res.status(404).json({ error: "Not found" });
}
