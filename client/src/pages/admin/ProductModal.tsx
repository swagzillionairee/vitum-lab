/*
 * ProductModal.tsx — add/edit a product (with its variants + image upload).
 */

import { useState, useRef } from "react";
import { Trash2, Plus, Loader2, Upload, X } from "lucide-react";
import { authedFetch } from "@/lib/api";
import { invalidateProductsCache } from "@/hooks/useProducts";
import type { ProductRow, Variant } from "./types";
import { Field, BADGE_OPTIONS, CATEGORY_OPTIONS } from "./shared";

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

export function ProductModal({
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
