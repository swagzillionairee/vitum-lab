import { useState, useEffect } from "react";
import { products as staticProducts, type Product } from "@/lib/products";

let cache: Product[] | null = null;
let fetchPromise: Promise<Product[]> | null = null;

function dbRowToProduct(row: Record<string, unknown>): Product {
  const variants = (row.variants as Record<string, unknown>[]) ?? [];
  return {
    slug: row.slug as string,
    name: row.name as string,
    fullName: row.full_name as string,
    category: row.category as string,
    tagline: row.tagline as string,
    description: row.description as string,
    longDescription: row.long_description as string,
    cardBg: row.card_bg as string,
    badge: (row.badge as string | null) ?? undefined,
    variants: variants.map((v) => {
      const basePrice = v.price as number;
      const rawSale = (v.sale_price ?? null) as number | null;
      const endsAt = (v.sale_ends_at ?? null) as string | null;
      // On sale when a lower sale price is set and the sale hasn't expired.
      // A missing end date means the sale is ongoing.
      const onSale = rawSale != null && rawSale < basePrice && (endsAt == null || new Date(endsAt) > new Date());
      return {
        id: v.id as string,
        dose: v.dose as string,
        lot: v.lot as string,
        price: basePrice,
        salePrice: onSale ? rawSale : undefined,
        saleEndsAt: endsAt ?? undefined,
        img: v.image_url as string,
        cartCode: v.cart_code as string,
      };
    }),
    specs: (row.specs as { label: string; value: string }[]) ?? [],
    storageInstructions: row.storage_instructions as string,
    reconstitutionNote: (row.reconstitution_note as string | null) ?? undefined,
    researchNotes: (row.research_notes as string[]) ?? [],
    coaHref: row.coa_href as string,
  };
}

async function fetchProducts(): Promise<Product[]> {
  if (cache) return cache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/products")
    .then((r) => r.json())
    .then((rows: Record<string, unknown>[]) => {
      cache = rows.map(dbRowToProduct);
      return cache;
    })
    .catch(() => staticProducts);

  return fetchPromise;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(cache ?? staticProducts);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) { setProducts(cache); return; }
    fetchProducts().then((p) => { setProducts(p); setLoading(false); });
  }, []);

  return { products, loading };
}

export function invalidateProductsCache() {
  cache = null;
  fetchPromise = null;
}
