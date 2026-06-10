import { describe, it, expect } from "vitest";
import { dbRowToProduct } from "./useProducts";

const baseRow = {
  slug: "x", name: "X", full_name: "X full", category: "Cat", tagline: "t",
  description: "d", long_description: "ld", card_bg: "#fff", badge: null,
  specs: [], storage_instructions: "", reconstitution_note: null, research_notes: [], coa_href: "",
};
const variant = (over: Record<string, unknown> = {}) => ({
  id: "v", dose: "10 MG", lot: "A", price: 129, sale_price: null, sale_ends_at: null, image_url: "", cart_code: "x-10", ...over,
});
const map = (v: Record<string, unknown>) => dbRowToProduct({ ...baseRow, variants: [v] }).variants[0];

describe("dbRowToProduct — sale / strikethrough logic", () => {
  it("marks a variant on sale when sale_price is below price and not expired", () => {
    const v = map(variant({ sale_price: 99 }));
    expect(v.salePrice).toBe(99);
    expect(v.price).toBe(129);
  });

  it("ignores an expired sale", () => {
    expect(map(variant({ sale_price: 99, sale_ends_at: "2000-01-01T00:00:00Z" })).salePrice).toBeUndefined();
  });

  it("treats a future end date as still on sale", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(map(variant({ sale_price: 99, sale_ends_at: future })).salePrice).toBe(99);
  });

  it("ignores a sale_price that isn't actually lower than the price", () => {
    expect(map(variant({ sale_price: 129 })).salePrice).toBeUndefined();
    expect(map(variant({ sale_price: 200 })).salePrice).toBeUndefined();
  });

  it("has no salePrice when none is set (mirrors the site-wide-off case)", () => {
    expect(map(variant()).salePrice).toBeUndefined();
  });
});
