import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAffiliate } from "../_lib/requireAffiliate";
import { supabaseAdmin } from "../_lib/supabase-admin";

// Handles all /api/affiliate/* routes: stats, orders
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const affiliate = await requireAffiliate(req);
  if (!affiliate) return res.status(401).json({ error: "Unauthorized" });

  // Parse route from URL — more reliable than req.query.slug with rewrites
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/affiliate\/?/, "").split("/")[0];

  // ── /api/affiliate/stats ──────────────────────────────────────────────────
  if (route === "stats") {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("net_amount, discount_amount, commission_amount, status, created_at")
      .eq("affiliate_id", affiliate.id)
      .in("status", ["confirmed", "finished"]);

    if (error) return res.status(500).json({ error: "Failed to fetch stats" });

    const orders = data ?? [];
    const totalOrders = orders.length;
    const revenue = orders.reduce((s, o) => s + Number(o.net_amount || 0), 0);
    const discountsGiven = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0);
    const commission = orders.reduce(
      (s, o) => s + Number(o.commission_amount ?? (Number(o.net_amount || 0) * affiliate.commission_percent) / 100),
      0,
    );

    const days: Record<string, number> = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    for (const o of orders) {
      const key = new Date(o.created_at).toISOString().slice(0, 10);
      if (key in days) days[key] += 1;
    }
    const series = Object.entries(days).map(([date, count]) => ({ date, count }));

    return res.json({
      code: affiliate.code, name: affiliate.name,
      discountPercent: affiliate.discount_percent, commissionPercent: affiliate.commission_percent,
      totalOrders, revenue: Number(revenue.toFixed(2)),
      discountsGiven: Number(discountsGiven.toFixed(2)),
      commission: Number(commission.toFixed(2)), series,
    });
  }

  // ── /api/affiliate/orders ─────────────────────────────────────────────────
  if (route === "orders") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const page = Math.max(1, parseInt((req.query?.page as string) || "1", 10));
    const perPage = 25;
    const from = (page - 1) * perPage;
    const { data, error, count } = await supabaseAdmin
      .from("orders")
      .select("id, net_amount, discount_amount, commission_amount, status, created_at", { count: "exact" })
      .eq("affiliate_id", affiliate.id)
      .order("created_at", { ascending: false })
      .range(from, from + perPage - 1);
    if (error) return res.status(500).json({ error: "Failed to fetch orders" });
    return res.json({ orders: data, total: count ?? 0, page, perPage });
  }

  return res.status(404).json({ error: "Not found" });
}
