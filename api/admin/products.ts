import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../server/lib/requireAdmin";
import { supabaseAdmin } from "../../server/lib/supabase-admin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    const body = req.body;
    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        slug: body.slug,
        name: body.name,
        full_name: body.full_name,
        category: body.category,
        tagline: body.tagline,
        description: body.description,
        long_description: body.long_description,
        card_bg: body.card_bg ?? "#f5f5f5",
        badge: body.badge ?? null,
        variants: body.variants ?? [],
        specs: body.specs ?? [],
        storage_instructions: body.storage_instructions ?? "",
        reconstitution_note: body.reconstitution_note ?? null,
        research_notes: body.research_notes ?? [],
        coa_href: body.coa_href ?? "",
        is_active: body.is_active ?? true,
        display_order: body.display_order ?? 99,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "PATCH") {
    const { id, ...patch } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await supabaseAdmin
      .from("products")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
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

  res.status(405).json({ error: "Method not allowed" });
}
