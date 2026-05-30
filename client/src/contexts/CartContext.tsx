/*
 * CartContext.tsx — Vitum Lab
 * Global cart state: items, quantities, drawer open/close
 * Persists to sessionStorage so cart survives page navigation
 * Auto-adds free BAC Water when subtotal crosses $150
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { toast } from "sonner";

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
const FREE_SHIPPING_THRESHOLD = 150;

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
    return raw ? JSON.parse(raw) : [];
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  // Persist on every change
  useEffect(() => {
    saveCart(items);
  }, [items]);

  // Auto-add / auto-remove free BAC Water based on subtotal
  useEffect(() => {
    const paidSubtotal = items
      .filter(i => !i.isFreeGift)
      .reduce((sum, i) => sum + i.price * i.quantity, 0);

    const hasFreeGift = items.some(i => i.id === FREE_BAC_WATER.id);

    if (paidSubtotal >= FREE_SHIPPING_THRESHOLD && !hasFreeGift) {
      setItems(prev => [...prev, { ...FREE_BAC_WATER, quantity: 1 }]);
      toast.success("🎉 Free BAC Water added to your cart!", {
        description: "You've unlocked free shipping + a free BAC Water.",
        duration: 4000,
      });
    } else if (paidSubtotal < FREE_SHIPPING_THRESHOLD && hasFreeGift) {
      setItems(prev => prev.filter(i => i.id !== FREE_BAC_WATER.id));
    }
  }, [items]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback((newItem: Omit<CartItem, "quantity">) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === newItem.id);
      if (existing) {
        return prev.map(i =>
          i.id === newItem.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...newItem, quantity: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      setItems(prev => prev.map(i => (i.id === id ? { ...i, quantity } : i)));
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
