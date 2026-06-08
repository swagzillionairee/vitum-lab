import { supabaseAdmin } from "./_lib/supabase-admin.js";

export default async function handler(req: any, res: any) {
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
