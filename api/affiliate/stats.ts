import { supabaseAdmin } from "../../server/lib/supabase-admin";
import { requireAffiliate } from "../../server/lib/requireAffiliate";

/**
 * Aggregate stats for the logged-in affiliate: totals + a daily series
 * (last 30 days) for the dashboard chart. Counts confirmed/finished orders.
 */
export default async function handler(req: any, res: any) {
  const affiliate = await requireAffiliate(req);
  if (!affiliate) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("net_amount, discount_amount, commission_amount, status, created_at")
    .eq("affiliate_id", affiliate.id)
    .in("status", ["confirmed", "finished"]);

  if (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
    return;
  }

  const orders = data ?? [];
  const totalOrders = orders.length;
  const revenue = orders.reduce((s, o) => s + Number(o.net_amount || 0), 0);
  const discountsGiven = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0);
  const commission = orders.reduce(
    (s, o) => s + Number(o.commission_amount ?? (Number(o.net_amount || 0) * affiliate.commission_percent) / 100),
    0,
  );

  // Daily series for last 30 days
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

  res.status(200).json({
    code: affiliate.code,
    name: affiliate.name,
    discountPercent: affiliate.discount_percent,
    commissionPercent: affiliate.commission_percent,
    totalOrders,
    revenue: Number(revenue.toFixed(2)),
    discountsGiven: Number(discountsGiven.toFixed(2)),
    commission: Number(commission.toFixed(2)),
    series,
  });
}
