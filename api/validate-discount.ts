import { supabaseAdmin } from "../server/lib/supabase-admin";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code } = req.body as { code?: string };
  if (!code?.trim()) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .select("id, code, discount_percent")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      res.status(404).json({ valid: false, error: "Invalid or expired promo code." });
      return;
    }

    res.status(200).json({ valid: true, discountPct: data.discount_percent, affiliateId: data.id });
  } catch (err) {
    console.error("validate-discount error:", err);
    res.status(500).json({ error: "Failed to validate code" });
  }
}
