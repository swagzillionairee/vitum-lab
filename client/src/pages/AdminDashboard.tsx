/*
 * AdminDashboard.tsx — Vitum Lab
 * Owner-only dashboard. Tabs: Products | Inventory | Orders
 * - Products: add/edit/delete products, manage variants (price, sale, image), badge, visibility
 * - Inventory: edit stock levels, toggle active/inactive per cart_code
 * - Orders: paginated order table with status badges
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Package, ClipboardList, LogOut, Loader2, Check, Plus,
  Pencil, Trash2, X, Upload, ShoppingBag, ImageOff,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import { invalidateProductsCache } from "@/hooks/useProducts";
import SEO from "@/components/SEO";

// ─── Types ────────────────────────────────────────────────────────────────────
interface InventoryRow {
  cart_code: string;
  stock: number;
  is_active: boolean;
  updated_at: string;
}

interface OrderRow {
  id: string;
  email: string;
  net_amount: number;
  status: string;
  created_at: string;
}

interface Variant {
  id: string;
  dose: string;
  lot: string;
  price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  image_url: string;
  cart_code: string;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  full_name: string;
  category: string;
  tagline: string;
  description: string;
  long_description: string;
  card_bg: string;
  badge: string | null;
  variants: Variant[];
  specs: { label: string; value: string }[];
  storage_instructions: string;
  reconstitution_note: string | null;
  research_notes: string[];
  coa_href: string;
  is_active: boolean;
  display_order: number;
}

const BADGE_OPTIONS = ["", "Best Seller", "New", "Limited", "Out of Stock", "Sale"];
const CATEGORY_OPTIONS = [
  "Metabolic Research",
  "Cosmetic / Tissue Research",
  "Cellular Research",
  "Reconstitution",
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
  finished: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
  failed: "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]",
  pending: "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]",
};

// ─── Variant editor sub-component ─────────────────────────────────────────────
function VariantEditor({
  variants,
  onChange,
}: {
  variants: Variant[];
  onChange: (v: Variant[]) => void;
}) {
  const update = (i: number, patch: Partial<Variant>) => {
    const copy = variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onChange(copy);
  };

  const add = () =>
    onChange([
      ...variants,
      { id: `variant-${Date.now()}`, dose: "", lot: "", price: 0, sale_price: null, sale_ends_at: null, image_url: "", cart_code: "" },
    ]);

  const remove = (i: number) => onChange(variants.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {variants.map((v, i) => (
        <div key={i} className="border border-[oklch(0.88_0.004_260)] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)]">Variant {i + 1}</span>
            {variants.length > 1 && (
              <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Dose (e.g. 10 MG)">
              <input value={v.dose} onChange={(e) => update(i, { dose: e.target.value })} className="input-sm" />
            </Field>
            <Field label="LOT">
              <input value={v.lot} onChange={(e) => update(i, { lot: e.target.value })} className="input-sm" />
            </Field>
            <Field label="Cart Code">
              <input value={v.cart_code} onChange={(e) => update(i, { cart_code: e.target.value })} className="input-sm font-mono" />
            </Field>
            <Field label="Price ($)">
              <input type="number" min={0} value={v.price} onChange={(e) => update(i, { price: Number(e.target.value) })} className="input-sm" />
            </Field>
            <Field label="Sale Price ($) — optional">
              <input type="number" min={0} value={v.sale_price ?? ""} placeholder="—"
                onChange={(e) => update(i, { sale_price: e.target.value ? Number(e.target.value) : null })} className="input-sm" />
            </Field>
            <Field label="Sale Ends At — optional">
              <input type="datetime-local" value={v.sale_ends_at ? v.sale_ends_at.slice(0, 16) : ""}
                onChange={(e) => update(i, { sale_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="input-sm" />
            </Field>
          </div>
          <Field label="Image URL (or upload below)">
            <input value={v.image_url} onChange={(e) => update(i, { image_url: e.target.value })} className="input-sm font-mono" placeholder="/path/to/image.png" />
          </Field>
          <ImageUploadButton onUploaded={(url) => update(i, { image_url: url })} currentUrl={v.image_url} />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.35_0.15_260)] hover:underline">
        <Plus className="w-4 h-4" /> Add Variant
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] mb-1">{label}</p>
      {children}
    </div>
  );
}

function ImageUploadButton({ onUploaded, currentUrl }: { onUploaded: (url: string) => void; currentUrl: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setUploading(true);
    setError("");
    const res = await authedFetch("/api/admin/upload", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!res.ok) { setError("Upload failed"); setUploading(false); return; }
    const { signedUrl, path } = await res.json();

    const put = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!put.ok) { setError("Upload failed"); setUploading(false); return; }

    const publicUrl = `https://mddgtvwcwsmlbwiafdvq.supabase.co/storage/v1/object/public/product-images/${path}`;
    onUploaded(publicUrl);
    setUploading(false);
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)] disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {uploading ? "Uploading…" : "Upload Image"}
      </button>
      {currentUrl && (
        <div className="mt-2 flex items-center gap-2">
          <img src={currentUrl} alt="" className="w-12 h-12 object-cover rounded-lg border border-[oklch(0.91_0.004_260)]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="text-[0.6875rem] text-[oklch(0.60_0.01_260)] truncate max-w-[200px]">{currentUrl.split("/").pop()}</span>
        </div>
      )}
      {error && <p className="text-[0.75rem] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Product edit / create modal ──────────────────────────────────────────────
function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onSaved: (p: ProductRow) => void;
}) {
  const isNew = !product;
  const [form, setForm] = useState<Omit<ProductRow, "id" | "updated_at">>({
    slug: product?.slug ?? "",
    name: product?.name ?? "",
    full_name: product?.full_name ?? "",
    category: product?.category ?? CATEGORY_OPTIONS[0],
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    long_description: product?.long_description ?? "",
    card_bg: product?.card_bg ?? "#f5f5f5",
    badge: product?.badge ?? null,
    variants: product?.variants ?? [{ id: `v-${Date.now()}`, dose: "", lot: "", price: 0, sale_price: null, sale_ends_at: null, image_url: "", cart_code: "" }],
    specs: product?.specs ?? [],
    storage_instructions: product?.storage_instructions ?? "",
    reconstitution_note: product?.reconstitution_note ?? null,
    research_notes: product?.research_notes ?? [],
    coa_href: product?.coa_href ?? "",
    is_active: product?.is_active ?? true,
    display_order: product?.display_order ?? 99,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    setError("");
    const body = isNew ? { ...form } : { id: product.id, ...form };
    const res = await authedFetch("/api/admin/products", {
      method: isNew ? "POST" : "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? "Save failed"); return; }
    const saved = await res.json();
    invalidateProductsCache();
    onSaved(saved);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-[oklch(0.91_0.004_260)]">
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">
            {isNew ? "Add Product" : `Edit — ${product.name}`}
          </h2>
          <button onClick={onClose} className="text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name (short, e.g. GLP-3 (R))">
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input-sm w-full" />
            </Field>
            <Field label="Slug (URL, e.g. retatrutide)">
              <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} className="input-sm w-full font-mono" />
            </Field>
          </div>
          <Field label="Full Name">
            <input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} className="input-sm w-full" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select value={form.category} onChange={(e) => set({ category: e.target.value })} className="input-sm w-full">
                {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Badge (optional)">
              <select value={form.badge ?? ""} onChange={(e) => set({ badge: e.target.value || null })} className="input-sm w-full">
                {BADGE_OPTIONS.map((b) => <option key={b} value={b}>{b || "None"}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Card Background Color">
              <div className="flex items-center gap-2">
                <input type="color" value={form.card_bg} onChange={(e) => set({ card_bg: e.target.value })}
                  className="w-10 h-9 rounded border border-[oklch(0.88_0.004_260)] cursor-pointer" />
                <input value={form.card_bg} onChange={(e) => set({ card_bg: e.target.value })} className="input-sm flex-1 font-mono" />
              </div>
            </Field>
            <Field label="Display Order">
              <input type="number" value={form.display_order} onChange={(e) => set({ display_order: Number(e.target.value) })} className="input-sm w-full" />
            </Field>
          </div>
          <Field label="Tagline">
            <input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} className="input-sm w-full" />
          </Field>
          <Field label="Short Description (shop card)">
            <textarea value={form.description} onChange={(e) => set({ description: e.target.value })}
              rows={2} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Long Description (detail page)">
            <textarea value={form.long_description} onChange={(e) => set({ long_description: e.target.value })}
              rows={4} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Storage Instructions">
            <textarea value={form.storage_instructions} onChange={(e) => set({ storage_instructions: e.target.value })}
              rows={2} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Reconstitution Note (optional)">
            <textarea value={form.reconstitution_note ?? ""} onChange={(e) => set({ reconstitution_note: e.target.value || null })}
              rows={2} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Research Notes (one per line)">
            <textarea value={(form.research_notes ?? []).join("\n")}
              onChange={(e) => set({ research_notes: e.target.value.split("\n").filter(Boolean) })}
              rows={4} className="input-sm w-full resize-none font-mono text-[0.75rem]" />
          </Field>
          <Field label="COA Href (e.g. /coa/product.pdf)">
            <input value={form.coa_href} onChange={(e) => set({ coa_href: e.target.value })} className="input-sm w-full font-mono" />
          </Field>

          {/* Visibility */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => set({ is_active: !form.is_active })}
              className={`px-4 py-1.5 rounded-full text-[0.8125rem] font-semibold transition-colors ${
                form.is_active
                  ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                  : "bg-[oklch(0.93_0.003_260)] text-[oklch(0.52_0.01_260)]"
              }`}
            >
              {form.is_active ? "Visible on Shop" : "Hidden from Shop"}
            </button>
            <span className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">Click to toggle</span>
          </div>

          {/* Variants */}
          <div>
            <p className="text-[0.75rem] font-bold uppercase tracking-wider text-[oklch(0.40_0.01_260)] mb-3">Variants</p>
            <VariantEditor variants={form.variants} onChange={(v) => set({ variants: v })} />
          </div>

          {error && <p className="text-[0.875rem] text-red-500">{error}</p>}
        </div>

        <div className="p-6 border-t border-[oklch(0.91_0.004_260)] flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-[0.875rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-6 py-2 text-[0.875rem] disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isNew ? "Create Product" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { session, loading, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"products" | "inventory" | "orders">("products");

  // Products
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editProduct, setEditProduct] = useState<ProductRow | null | "new">(null);

  // Inventory
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [savedCode, setSavedCode] = useState<string | null>(null);

  // Orders
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    if (!loading && !session) navigate("/admin/login");
  }, [loading, session, navigate]);

  const loadData = useCallback(async () => {
    const invRes = await authedFetch("/api/admin/inventory");
    if (invRes.status === 401) { setAuthorized(false); return; }
    setAuthorized(true);
    setInventory(await invRes.json());

    const [prodRes, ordRes] = await Promise.all([
      authedFetch("/api/admin/products"),
      authedFetch("/api/admin/orders"),
    ]);
    if (prodRes.ok) setProducts(await prodRes.json());
    if (ordRes.ok) setOrders((await ordRes.json()).orders ?? []);
  }, []);

  useEffect(() => { if (session) loadData(); }, [session, loadData]);

  const updateInventory = async (cartCode: string, patch: { stock?: number; isActive?: boolean }) => {
    const res = await authedFetch("/api/admin/inventory", {
      method: "PATCH",
      body: JSON.stringify({ cartCode, ...patch }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInventory((prev) => prev.map((r) => (r.cart_code === cartCode ? updated : r)));
      setSavedCode(cartCode);
      setTimeout(() => setSavedCode((c) => (c === cartCode ? null : c)), 1500);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    const res = await authedFetch("/api/admin/products", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      invalidateProductsCache();
    }
  };

  if (loading || authorized === null) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" /></div>;
  }

  if (authorized === false) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Not authorized</h1>
        <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-6">This account doesn't have admin access.</p>
        <button onClick={() => { signOut(); navigate("/admin/login"); }} className="btn-primary">Sign out</button>
      </div>
    );
  }

  const tabs = [
    { key: "products" as const, label: "Products", icon: ShoppingBag },
    { key: "inventory" as const, label: "Inventory", icon: Package },
    { key: "orders" as const, label: "Orders", icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)]">
      <SEO title="Admin Dashboard" description="Vitum Lab admin." />

      {editProduct !== null && (
        <ProductModal
          product={editProduct === "new" ? null : editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={(saved) => {
            setProducts((prev) => {
              const idx = prev.findIndex((p) => p.id === saved.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
              return [...prev, saved];
            });
            setEditProduct(null);
          }}
        />
      )}

      <div className="container py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[2rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">Admin</h1>
          <button
            onClick={() => { signOut(); navigate("/admin/login"); }}
            className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[0.875rem] font-semibold transition-colors ${
                tab === key
                  ? "bg-[oklch(0.13_0.01_260)] text-white"
                  : "bg-white text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.94_0.003_260)] shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ── Products tab ──────────────────────────────────────────────── */}
        {tab === "products" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Products</h2>
              </div>
              <button
                onClick={() => setEditProduct("new")}
                className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4"
              >
                <Plus className="w-4 h-4" /> Add Product
              </button>
            </div>

            <div className="space-y-3">
              {products.map((p) => (
                <div key={p.id} className="flex items-start gap-4 border border-[oklch(0.93_0.004_260)] rounded-xl p-4">
                  {/* Image preview */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-[oklch(0.91_0.004_260)] flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: p.card_bg }}>
                    {p.variants[0]?.image_url ? (
                      <img src={p.variants[0].image_url} alt={p.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode("")); }} />
                    ) : (
                      <ImageOff className="w-5 h-5 text-[oklch(0.60_0.01_260)]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[oklch(0.13_0.01_260)]">{p.name}</span>
                      {p.badge && (
                        <span className="text-[0.625rem] uppercase tracking-wider font-bold px-2 py-0.5 bg-[oklch(0.95_0.04_260)] text-[oklch(0.35_0.15_260)] rounded-full">{p.badge}</span>
                      )}
                      <span className={`text-[0.625rem] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${p.is_active ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]" : "bg-[oklch(0.93_0.003_260)] text-[oklch(0.52_0.01_260)]"}`}>
                        {p.is_active ? "Visible" : "Hidden"}
                      </span>
                    </div>
                    <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] mt-0.5">{p.category} · {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {p.variants.map((v) => (
                        <span key={v.id} className="text-[0.6875rem] font-mono bg-[oklch(0.96_0.003_260)] text-[oklch(0.40_0.01_260)] px-2 py-0.5 rounded">
                          {v.dose} · ${v.sale_price ?? v.price}{v.sale_price ? ` (was $${v.price})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEditProduct(p)}
                      className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)]"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => deleteProduct(p.id)}
                      className="flex items-center gap-1 text-[0.75rem] font-semibold text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">No products yet. Add one above.</p>
              )}
            </div>
          </section>
        )}

        {/* ── Inventory tab ─────────────────────────────────────────────── */}
        {tab === "inventory" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center gap-2 mb-6">
              <Package className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
              <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Inventory</h2>
            </div>
            <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-4">Edit stock and toggle visibility per cart code. Changes save automatically on blur.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                    <th className="py-2 pr-4">Cart Code</th>
                    <th className="py-2 pr-4">Stock</th>
                    <th className="py-2 pr-4">Visibility</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((row) => (
                    <tr key={row.cart_code} className="border-b border-[oklch(0.95_0.003_260)]">
                      <td className="py-3 pr-4 font-mono text-[0.8125rem] text-[oklch(0.20_0.01_260)]">{row.cart_code}</td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          min={0}
                          defaultValue={row.stock}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v !== row.stock) updateInventory(row.cart_code, { stock: v });
                          }}
                          className="w-20 border border-[oklch(0.88_0.004_260)] rounded-lg px-2 py-1.5 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => updateInventory(row.cart_code, { isActive: !row.is_active })}
                          className={`px-3 py-1 rounded-full text-[0.75rem] font-semibold ${
                            row.is_active
                              ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                              : "bg-[oklch(0.93_0.003_260)] text-[oklch(0.52_0.01_260)]"
                          }`}
                        >
                          {row.is_active ? "Active" : "Hidden"}
                        </button>
                      </td>
                      <td className="py-3 text-[oklch(0.35_0.14_155)]">
                        {savedCode === row.cart_code && (
                          <span className="flex items-center gap-1 text-[0.75rem]"><Check className="w-3.5 h-3.5" /> Saved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Orders tab ────────────────────────────────────────────────── */}
        {tab === "orders" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center gap-2 mb-6">
              <ClipboardList className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
              <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Orders</h2>
            </div>
            {orders.length === 0 ? (
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">No orders yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.875rem]">
                  <thead>
                    <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                      <th className="py-2 pr-4">Order</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b border-[oklch(0.95_0.003_260)]">
                        <td className="py-3 pr-4 font-mono text-[0.75rem] text-[oklch(0.20_0.01_260)]">{o.id.slice(0, 10)}</td>
                        <td className="py-3 pr-4 text-[oklch(0.40_0.01_260)]">{o.email}</td>
                        <td className="py-3 pr-4 font-semibold text-[oklch(0.13_0.01_260)]">${Number(o.net_amount).toFixed(2)}</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${STATUS_COLORS[o.status] ?? STATUS_COLORS.pending}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3 text-[0.8125rem] text-[oklch(0.52_0.01_260)]">{new Date(o.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
