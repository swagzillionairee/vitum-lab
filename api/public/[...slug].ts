import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { isSitewideActive } from "../_lib/pricing.js";
import { squareConfigured } from "../_lib/square.js";

// Shape the admin payment_config into the offer the checkout renders. A manual
// method is offered only when enabled AND it has a handle; Square only when
// enabled AND the server has credentials; crypto defaults on.
function buildPayments(raw: unknown) {
  const cfg = (raw ?? {}) as Record<string, { enabled?: boolean; handle?: string; instructions?: string }>;
  const manual = (key: string) => {
    const m = cfg[key] ?? {};
    const handle = String(m.handle ?? "").trim();
    return { enabled: !!m.enabled && handle.length > 0, handle, instructions: String(m.instructions ?? "") };
  };
  return {
    square: { enabled: !!cfg.square?.enabled && squareConfigured() },
    zelle: manual("zelle"),
    cashapp: manual("cashapp"),
    venmo: manual("venmo"),
    ach: manual("ach"),
    crypto: { enabled: cfg.crypto?.enabled !== false },
  };
}

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
      payments: buildPayments(s?.payment_config),
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
        "id, email, items, net_amount, shipping_amount, status, fulfillment_status, tracking_number, carrier, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at, cancel_reason",
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
