import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { type ReactNode } from "react";
import { CartProvider, useCart } from "./CartContext";

// The free-gift auto-add fires a toast — stub it so tests don't need a Toaster.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;
const item = (over: Partial<Parameters<ReturnType<typeof useCart>["addItem"]>[0]> = {}) => ({
  id: "retatrutide-10mg", name: "GLP-3 (R)", dose: "10 MG", price: 129, img: "", cartCode: "retatrutide-10mg", ...over,
});

beforeEach(() => sessionStorage.clear());
afterEach(() => cleanup());

describe("CartContext", () => {
  it("adds an item and computes the subtotal", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(item()));
    expect(result.current.totalItems).toBe(1);
    expect(result.current.subtotal).toBe(129);
  });

  it("increments quantity when the same item is added again", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    // $50 × 2 stays under the $150 free-gift threshold (no auto-added gift).
    act(() => result.current.addItem(item({ id: "x", price: 50, cartCode: "x" })));
    act(() => result.current.addItem(item({ id: "x", price: 50, cartCode: "x" })));
    expect(result.current.totalItems).toBe(2);
    expect(result.current.subtotal).toBe(100);
  });

  it("auto-adds a single free BAC Water at the $150 threshold, capped at qty 1", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(item({ id: "r30", price: 249, cartCode: "retatrutide-30mg" })));
    const gift = result.current.items.find((i) => i.cartCode === "bac-water-free");
    expect(gift).toBeTruthy();
    expect(gift?.quantity).toBe(1);
    expect(gift?.price).toBe(0);
    // The free gift never affects the subtotal.
    expect(result.current.subtotal).toBe(249);
  });

  it("removes the free gift once the paid subtotal drops back below $150", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(item({ id: "big", price: 160, cartCode: "big" })));
    expect(result.current.items.some((i) => i.cartCode === "bac-water-free")).toBe(true);
    act(() => result.current.removeItem("big"));
    expect(result.current.items.some((i) => i.cartCode === "bac-water-free")).toBe(false);
  });
});
