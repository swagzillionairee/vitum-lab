import { supabaseAdmin } from "../../server/lib/supabase-admin";
import { requireAdmin } from "../../server/lib/requireAdmin";

export default async function handler(req: any, res: any) {
  const admin = await requireAdmin(req);
  if (!admin) {
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
    .select("id, email, items, gross_amount, discount_amount, net_amount, discount_code, status, created_at, confirmed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
    return;
  }

  res.status(200).json({ orders: data, total: count ?? 0, page, perPage });
}
