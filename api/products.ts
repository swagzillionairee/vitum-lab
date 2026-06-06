import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_lib/supabase-admin";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  res.json(data);
}
