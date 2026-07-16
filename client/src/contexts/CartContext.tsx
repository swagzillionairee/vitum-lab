/*
 * CartContext.tsx — Vitum Lab
 * Global cart state: items, quantities, drawer open/close
 * Persists to sessionStorage so cart survives page navigation
 * Auto-adds free BAC Water when subtotal crosses $100
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { toast } from "sonner";
import { useProducts } from "@/hooks/useProducts";
import { FREE_GIFT_THRESHOLD } from "@/lib/discounts";

export interface CartItem {
  id: string;
  name: string;
  dose: string;
  price: number;
  img: string;
  cartCode: string;
  quantity: number;
  isFreeGift?: boolean;
}

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const SESSION_KEY = "vitum_cart";

const FREE_BAC_WATER: Omit<CartItem, "quantity"> = {
  id: "free-bac-water",
  name: "BAC Water (Free Gift)",
  dose: "10 ML",
  price: 0,
  img: "/BAC%20WATER%2010ML%20PRODUCT%20PIC.png",
  cartCode: "bac-water-free",
  isFreeGift: true,
};

function loadCart(): CartItem[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Shape guard: valid JSON that isn't an item array (extension/stale writer)
    // would crash every page at items.reduce — treat it as an empty cart.
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i === "object" && typeof i.cartCode === "string") : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/**
 * Re-sync cart item prices to the authoritative catalog (cartCode → effective
 * price, i.e. salePrice ?? price). A cart is stored in sessionStorage with the
 * price captured at add-to-cart time, so an admin price change (or a sale
 * starting/ending) would otherwise leave a stale price in the cart. Returns the
 * SAME array reference when nothing changed (so it won't trigger a render). The
 * free gift and any cartCode not in the catalog are left untouched.
 */
export function reconcileCartPrices(items: CartItem[], priceMap: Record<string, number>): CartItem[] {
  let changed = false;
  const next = items.map((i) => {
    if (i.isFreeGift) return i;
    const p = priceMap[i.cartCode];
    if (typeof p === "number" && p !== i.price) {
      changed = true;
      return { ...i, price: p };
    }
    return i;
  });
  return changed ? next : items;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isOpen, setIsOpen] = useState(false);
  const { products, loading: productsLoading } = useProducts();

  // Authoritative cartCode → effective price (mirrors the server: salePrice ?? price).
  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) {
      for (const v of p.variants) m[v.cartCode] = v.salePrice ?? v.price;
    }
    return m;
  }, [products]);

  // Persist on every change
  useEffect(() => {
    saveCart(items);
  }, [items]);

  // Re-price the cart from the live catalog once products have loaded, so an
  // admin price change (or a sale starting/ending) is reflected on items that
  // were added earlier. The server re-prices authoritatively at checkout; this
  // keeps the displayed cart/total honest in the meantime.
  useEffect(() => {
    if (productsLoading) return;
    setItems((prev) => reconcileCartPrices(prev, priceMap));
  }, [priceMap, productsLoading]);

  // Auto-add / auto-remove free BAC Water based on subtotal.
  // The free gift is always capped at quantity 1 — one per qualifying order.
  useEffect(() => {
    const paidSubtotal = items
      .filter((i) => !i.isFreeGift)
      .reduce((sum, i) => sum + i.price * i.quantity, 0);

    const freeGift = items.find((i) => i.id === FREE_BAC_WATER.id);
    const qualifies = paidSubtotal >= FREE_GIFT_THRESHOLD;

    if (qualifies && !freeGift) {
      setItems((prev) => [...prev, { ...FREE_BAC_WATER, quantity: 1 }]);
      toast.success("🎉 Free BAC Water added to your cart!", {
        description: "A complimentary 10mL BAC Water on orders over $100.",
        duration: 4000,
      });
    } else if (!qualifies && freeGift) {
      setItems((prev) => prev.filter((i) => i.id !== FREE_BAC_WATER.id));
    } else if (qualifies && freeGift && freeGift.quantity !== 1) {
      // Defensive: never let the free gift exceed 1.
      setItems((prev) => prev.map((i) => (i.id === FREE_BAC_WATER.id ? { ...i, quantity: 1 } : i)));
    }
  }, [items]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback((newItem: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === newItem.id);
      if (existing) {
        // Free gifts are limited to one per order — never increment.
        if (existing.isFreeGift) return prev;
        return prev.map((i) =>
          i.id === newItem.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...newItem, quantity: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) =>
        // Free gifts are pinned to quantity 1 regardless of the requested value.
        prev.map((i) => (i.id === id ? { ...i, quantity: i.isFreeGift ? 1 : quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = calcSubtotal(items);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
