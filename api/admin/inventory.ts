import { supabaseAdmin } from "../../server/lib/supabase-admin";
import { requireAdmin } from "../../server/lib/requireAdmin";

export default async function handler(req: any, res: any) {
  const admin = await requireAdmin(req);
  if (!admin) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("inventory")
      .select("cart_code, stock, is_active, updated_at")
      .order("cart_code");
    if (error) {
      res.status(500).json({ error: "Failed to fetch inventory" });
      return;
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === "PATCH") {
    const { cartCode, stock, isActive } = req.body as {
      cartCode?: string;
      stock?: number;
      isActive?: boolean;
    };
    if (!cartCode) {
      res.status(400).json({ error: "cartCode is required" });
      return;
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof stock === "number") {
      if (stock < 0) {
        res.status(400).json({ error: "stock cannot be negative" });
        return;
      }
      update.stock = stock;
    }
    if (typeof isActive === "boolean") update.is_active = isActive;

    const { data, error } = await supabaseAdmin
      .from("inventory")
      .update(update)
      .eq("cart_code", cartCode)
      .select()
      .maybeSingle();

    if (error || !data) {
      res.status(500).json({ error: "Failed to update inventory" });
      return;
    }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
