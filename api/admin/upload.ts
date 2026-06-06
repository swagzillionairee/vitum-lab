import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../server/lib/requireAdmin";
import { supabaseAdmin } from "../../server/lib/supabase-admin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const { filename, contentType } = req.body;
  if (!filename) return res.status(400).json({ error: "filename required" });

  const path = `products/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { data, error } = await supabaseAdmin.storage
    .from("product-images")
    .createSignedUploadUrl(path);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ signedUrl: data.signedUrl, path, token: data.token });
}
