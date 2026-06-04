import { useEffect, useState } from "react";

type StockMap = Record<string, number>;

let cache: StockMap | null = null;
let fetchPromise: Promise<StockMap> | null = null;

async function fetchInventory(): Promise<StockMap> {
  if (cache) return cache;
  if (!fetchPromise) {
    fetchPromise = fetch("/api/inventory")
      .then((r) => r.json())
      .then((data) => {
        cache = data;
        return data as StockMap;
      })
      .catch(() => ({}));
  }
  return fetchPromise;
}

export function useInventory() {
  const [stock, setStock] = useState<StockMap>(cache ?? {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    fetchInventory().then((data) => {
      setStock(data);
      setLoading(false);
    });
  }, []);

  return {
    loading,
    getStock: (cartCode: string) => stock[cartCode] ?? null,
    isAvailable: (cartCode: string) => (stock[cartCode] ?? 1) > 0,
    stockLabel: (cartCode: string) => {
      const s = stock[cartCode];
      if (s === undefined) return null;
      if (s === 0) return "Out of Stock";
      if (s <= 5) return `Only ${s} left`;
      return null;
    },
  };
}
