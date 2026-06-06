import { supabaseAdmin } from "../../server/lib/supabase-admin";
import { requireAffiliate } from "../../server/lib/requireAffiliate";

/**
 * Paginated list of orders attributed to the logged-in affiliate's code.
 */
export default async function handler(req: any, res: any) {
  const affiliate = await requireAffiliate(req);
  if (!affiliate) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const page = Math.max(1, parseInt((req.query?.page as string) || "1", 10));
  const perPage = 25;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, error, count } = await supabaseAdmin
    .from("orders")
    .select("id, net_amount, discount_amount, commission_amount, status, created_at", { count: "exact" })
    .eq("affiliate_id", affiliate.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
    return;
  }

  res.status(200).json({ orders: data, total: count ?? 0, page, perPage });
}
