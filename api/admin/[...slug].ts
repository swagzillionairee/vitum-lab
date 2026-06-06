import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../server/lib/requireAdmin";
import { supabaseAdmin } from "../../server/lib/supabase-admin";

// Handles all /api/admin/* routes: inventory, orders, products, upload
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  // Parse route from URL — more reliable than req.query.slug with rewrites
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/admin\/?/, "").split("/")[0];

  // ── /api/admin/inventory ──────────────────────────────────────────────────
  if (route === "inventory") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("inventory")
        .select("cart_code, stock, is_active, updated_at")
        .order("cart_code");
      if (error) return res.status(500).json({ error: "Failed to fetch inventory" });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { cartCode, stock, isActive } = req.body as { cartCode?: string; stock?: number; isActive?: boolean };
      if (!cartCode) return res.status(400).json({ error: "cartCode is required" });
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof stock === "number") {
        if (stock < 0) return res.status(400).json({ error: "stock cannot be negative" });
        update.stock = stock;
      }
      if (typeof isActive === "boolean") update.is_active = isActive;
      const { data, error } = await supabaseAdmin
        .from("inventory").update(update).eq("cart_code", cartCode).select().maybeSingle();
      if (error || !data) return res.status(500).json({ error: "Failed to update inventory" });
      return res.json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/orders ────────────────────────────────────────────────────
  if (route === "orders") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const page = Math.max(1, parseInt((req.query?.page as string) || "1", 10));
    const perPage = 25;
    const from = (page - 1) * perPage;
    const { data, error, count } = await supabaseAdmin
      .from("orders")
      .select("id, email, items, gross_amount, discount_amount, net_amount, discount_code, status, created_at, confirmed_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + perPage - 1);
    if (error) return res.status(500).json({ error: "Failed to fetch orders" });
    return res.json({ orders: data, total: count ?? 0, page, perPage });
  }

  // ── /api/admin/products ──────────────────────────────────────────────────
  if (route === "products") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("products").select("*").order("display_order", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "POST") {
      const body = req.body;
      const { data, error } = await supabaseAdmin.from("products").insert({
        slug: body.slug, name: body.name, full_name: body.full_name, category: body.category,
        tagline: body.tagline, description: body.description, long_description: body.long_description,
        card_bg: body.card_bg ?? "#f5f5f5", badge: body.badge ?? null,
        variants: body.variants ?? [], specs: body.specs ?? [],
        storage_instructions: body.storage_instructions ?? "", reconstitution_note: body.reconstitution_note ?? null,
        research_notes: body.research_notes ?? [], coa_href: body.coa_href ?? "",
        is_active: body.is_active ?? true, display_order: body.display_order ?? 99,
      }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { id, ...patch } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const { data, error } = await supabaseAdmin.from("products").update(patch).eq("id", id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const { error } = await supabaseAdmin.from("products").delete().eq("id", id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/upload ────────────────────────────────────────────────────
  if (route === "upload") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { filename, contentType } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    const path = `products/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data, error } = await supabaseAdmin.storage.from("product-images").createSignedUploadUrl(path);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ signedUrl: data.signedUrl, path, token: data.token });
  }

  return res.status(404).json({ error: "Not found" });
}
