// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { type ReactNode } from "react";
import { CartProvider, useCart, reconcileCartPrices } from "./CartContext";

// The free-gift auto-add fires a toast — stub it so tests don't need a Toaster.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The provider re-syncs prices from the catalog — stub it (empty catalog ⇒ no-op).
vi.mock("@/hooks/useProducts", () => ({ useProducts: () => ({ products: [], loading: false }) }));

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;
const item = (over: Partial<Parameters<ReturnType<typeof useCart>["addItem"]>[0]> = {}) => ({
  id: "retatrutide-10mg", name: "GLP-3 (R)", dose: "10 MG", price: 129, img: "", cartCode: "retatrutide-10mg", ...over,
});

// The cart persists to localStorage (sessionStorage is only read as a one-time
// migration source) — clear both so no cart leaks between tests.
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => cleanup());

describe("CartContext", () => {
  it("adds an item and computes the subtotal", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    // $69 stays under the $100 free-gift threshold (no auto-added gift here).
    act(() => result.current.addItem(item({ id: "ghk50", price: 69, cartCode: "ghk-cu-50mg" })));
    expect(result.current.totalItems).toBe(1);
    expect(result.current.subtotal).toBe(69);
  });

  it("increments quantity when the same item is added again", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    // $40 × 2 stays under the $100 free-gift threshold (no auto-added gift).
    act(() => result.current.addItem(item({ id: "x", price: 40, cartCode: "x" })));
    act(() => result.current.addItem(item({ id: "x", price: 40, cartCode: "x" })));
    expect(result.current.totalItems).toBe(2);
    expect(result.current.subtotal).toBe(80);
  });

  it("auto-adds a single free BAC Water at the $100 threshold, capped at qty 1", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(item({ id: "r30", price: 249, cartCode: "retatrutide-30mg" })));
    const gift = result.current.items.find((i) => i.cartCode === "bac-water-free");
    expect(gift).toBeTruthy();
    expect(gift?.quantity).toBe(1);
    expect(gift?.price).toBe(0);
    // The free gift never affects the subtotal.
    expect(result.current.subtotal).toBe(249);
  });

  it("removes the free gift once the paid subtotal drops back below $100", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(item({ id: "big", price: 160, cartCode: "big" })));
    expect(result.current.items.some((i) => i.cartCode === "bac-water-free")).toBe(true);
    act(() => result.current.removeItem("big"));
    expect(result.current.items.some((i) => i.cartCode === "bac-water-free")).toBe(false);
  });
});

describe("reconcileCartPrices", () => {
  const ci = (over: Partial<Parameters<ReturnType<typeof useCart>["addItem"]>[0]> & { quantity?: number } = {}) => ({
    id: "retatrutide-10mg", name: "GLP-3 (R)", dose: "10 MG", price: 129, img: "", cartCode: "retatrutide-10mg", quantity: 1, ...over,
  });

  it("updates a changed catalog price", () => {
    const items = [ci({ quantity: 2 })];
    const out = reconcileCartPrices(items, { "retatrutide-10mg": 99 });
    expect(out).not.toBe(items);
    expect(out[0].price).toBe(99);
    expect(out[0].quantity).toBe(2); // quantity preserved
  });

  it("leaves the free gift and unknown cartCodes untouched", () => {
    const items = [
      ci(),
      { id: "free-bac-water", name: "BAC", dose: "10 ML", price: 0, img: "", cartCode: "bac-water-free", quantity: 1, isFreeGift: true },
      ci({ id: "b", price: 69, cartCode: "ghk-cu-50mg" }),
    ];
    // bac-water-free is in the map but must stay $0; ghk-cu-50mg isn't in the map.
    const out = reconcileCartPrices(items, { "retatrutide-10mg": 110, "bac-water-free": 5 });
    expect(out[0].price).toBe(110);
    expect(out[1].price).toBe(0);
    expect(out[2].price).toBe(69);
  });

  it("returns the same reference when no price changed", () => {
    const items = [ci()];
    const out = reconcileCartPrices(items, { "retatrutide-10mg": 129 });
    expect(out).toBe(items);
  });
});
