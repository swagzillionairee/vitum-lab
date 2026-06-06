import { supabaseAdmin } from "../../server/lib/supabase-admin";
import { requireUser } from "../../server/lib/requireUser";

/**
 * Returns the logged-in customer's orders, matched by email. This links
 * historical orders too, since orders store the email used at checkout.
 */
export default async function handler(req: any, res: any) {
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, items, gross_amount, discount_amount, net_amount, status, created_at, confirmed_at")
    .eq("email", user.email)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
    return;
  }

  res.status(200).json({ orders: data });
}
