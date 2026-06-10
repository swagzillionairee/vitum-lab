import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sitewideSalePrice } from "./_lib/pricing.js";

type Variant = { price?: number; sale_price?: number | null; sale_ends_at?: string | null; [k: string]: unknown };
type ProductRow = { variants?: Variant[]; [k: string]: unknown };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("products").select("*").order("display_order", { ascending: true }),
    supabaseAdmin.from("store_settings").select("*").maybeSingle(),
  ]);

  if (error) return res.status(500).json({ error: error.message });

  // When a site-wide sale is active (and not expired), project it onto every
  // variant's sale_price so the storefront renders the strikethrough + new price
  // (and adds the discounted price to the cart). It overrides per-variant sales —
  // the site-wide promo always takes precedence.
  const now = Date.now();
  const sitewide =
    settings?.sitewide_active &&
    Number(settings.sitewide_percent) > 0 &&
    (!settings.sitewide_ends_at || new Date(settings.sitewide_ends_at).getTime() > now)
      ? { percent: Number(settings.sitewide_percent), endsAt: (settings.sitewide_ends_at as string | null) ?? null }
      : null;

  const products: ProductRow[] = (data ?? []) as ProductRow[];
  const out = sitewide
    ? products.map((p) => ({
        ...p,
        variants: (p.variants ?? []).map((v) => ({
          ...v,
          sale_price: sitewideSalePrice(Number(v.price) || 0, sitewide.percent),
          sale_ends_at: sitewide.endsAt,
        })),
      }))
    : products;

  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  res.json(out);
}
