import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../_lib/requireAdmin.js";
import { supabaseAdmin } from "../_lib/supabase-admin.js";

// Handles all /api/admin/* routes: inventory, orders, products, upload
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  // Parse route from URL — more reliable than req.query.slug with rewrites
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/admin\/?/, "").split("/")[0];

  // ── /api/admin/inventory ──────────────────────────────────────────────────
  if (route === "inventory") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("inventory")
        .select("cart_code, stock, is_active, updated_at")
        .order("cart_code");
      if (error) return res.status(500).json({ error: "Failed to fetch inventory" });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { cartCode, stock, isActive } = req.body as { cartCode?: string; stock?: number; isActive?: boolean };
      if (!cartCode) return res.status(400).json({ error: "cartCode is required" });
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof stock === "number") {
        if (stock < 0) return res.status(400).json({ error: "stock cannot be negative" });
        update.stock = stock;
      }
      if (typeof isActive === "boolean") update.is_active = isActive;
      const { data, error } = await supabaseAdmin
        .from("inventory").update(update).eq("cart_code", cartCode).select().maybeSingle();
      if (error || !data) return res.status(500).json({ error: "Failed to update inventory" });
      return res.json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/orders ────────────────────────────────────────────────────
  if (route === "orders") {
    const orderSelect =
      "id, email, items, gross_amount, discount_amount, net_amount, discount_code, affiliate_id, commission_amount, status, fulfillment_status, tracking_number, carrier, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, shipping_address, created_at, confirmed_at";

    if (req.method === "GET") {
      const page = Math.max(1, parseInt((req.query?.page as string) || "1", 10));
      const perPage = Math.min(2000, Math.max(1, parseInt((req.query?.perPage as string) || "25", 10)));
      const search = ((req.query?.search as string) || "").trim();
      const statusFilter = (req.query?.status as string) || "";
      const fulfillmentFilter = (req.query?.fulfillment as string) || "";
      const from = (page - 1) * perPage;

      let query = supabaseAdmin
        .from("orders")
        .select(orderSelect, { count: "exact" })
        .order("created_at", { ascending: false });

      if (search) query = query.or(`email.ilike.%${search}%,id.ilike.%${search}%`);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (fulfillmentFilter) query = query.eq("fulfillment_status", fulfillmentFilter);

      const { data, error, count } = await query.range(from, from + perPage - 1);
      if (error) return res.status(500).json({ error: "Failed to fetch orders" });
      return res.json({ orders: data, total: count ?? 0, page, perPage });
    }

    // Order actions: cancel | ship | deliver | recheck | notes
    if (req.method === "PATCH") {
      const body = req.body as {
        id?: string;
        action?: "cancel" | "ship" | "deliver" | "recheck" | "notes";
        reason?: string;
        tracking_number?: string;
        carrier?: string;
        admin_notes?: string;
      };
      const { id, action } = body;
      if (!id || !action) return res.status(400).json({ error: "id and action are required" });

      const { data: order, error: fetchErr } = await supabaseAdmin
        .from("orders")
        .select("id, items, status, fulfillment_status")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr || !order) return res.status(404).json({ error: "Order not found" });

      const PAID = ["confirmed", "finished"];
      type OrderItem = { cartCode: string; quantity: number; price: number };
      const paidItems = ((order.items as OrderItem[]) ?? []).filter(
        (i) => i.price > 0 && i.cartCode !== "bac-water-free",
      );

      if (action === "cancel") {
        if (order.status === "cancelled") return res.status(409).json({ error: "Order is already cancelled" });
        // Restock only if the order was paid (stock was decremented on confirm).
        if (PAID.includes(order.status)) {
          for (const item of paidItems) {
            await supabaseAdmin.rpc("increment_stock", { p_cart_code: item.cartCode, p_qty: item.quantity });
          }
        }
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: body.reason ?? "Cancelled by admin" })
          .eq("id", id)
          .select(orderSelect)
          .single();
        if (error) return res.status(500).json({ error: "Failed to cancel order" });
        return res.json(data);
      }

      if (action === "ship") {
        if (!body.tracking_number?.trim()) return res.status(400).json({ error: "tracking_number is required" });
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({
            fulfillment_status: "shipped",
            tracking_number: body.tracking_number.trim(),
            carrier: body.carrier?.trim() || null,
            shipped_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select(orderSelect)
          .single();
        if (error) return res.status(500).json({ error: "Failed to mark shipped" });
        return res.json(data);
      }

      if (action === "deliver") {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({ fulfillment_status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", id)
          .select(orderSelect)
          .single();
        if (error) return res.status(500).json({ error: "Failed to mark delivered" });
        return res.json(data);
      }

      if (action === "notes") {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({ admin_notes: body.admin_notes ?? null })
          .eq("id", id)
          .select(orderSelect)
          .single();
        if (error) return res.status(500).json({ error: "Failed to save notes" });
        return res.json(data);
      }

      if (action === "recheck") {
        // Reconcile against NowPayments in case an IPN webhook was missed.
        const apiKey = process.env.NOWPAYMENTS_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "NOWPAYMENTS_API_KEY not configured" });

        const np = await fetch(
          "https://api.nowpayments.io/v1/payment/?limit=500&page=0&sortBy=created_at&orderBy=desc",
          { headers: { "x-api-key": apiKey } },
        );
        if (!np.ok) return res.status(502).json({ error: "Failed to reach NowPayments" });

        const list = (await np.json()) as {
          data?: { order_id?: string; payment_status?: string; pay_currency?: string; pay_amount?: number; actually_paid?: number; payment_id?: number | string }[];
        };
        const matches = (list.data ?? []).filter((p) => p.order_id === id);
        if (matches.length === 0) return res.json({ ...order, recheck: "no_payment_found" });

        const statuses = matches.map((m) => m.payment_status ?? "");
        const isPaid = statuses.some((s) => s === "finished" || s === "confirmed");
        const isFailed = statuses.every((s) => s === "failed" || s === "expired" || s === "refunded");

        if (isPaid && order.status === "pending") {
          for (const item of paidItems) {
            await supabaseAdmin.rpc("decrement_stock", { p_cart_code: item.cartCode, p_qty: item.quantity });
          }
          const paid = matches.find((m) => m.payment_status === "finished" || m.payment_status === "confirmed");
          const { data, error } = await supabaseAdmin
            .from("orders")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
              pay_currency: paid?.pay_currency ?? null,
              pay_amount: paid?.actually_paid ?? paid?.pay_amount ?? null,
              payment_id: paid?.payment_id != null ? String(paid.payment_id) : null,
            })
            .eq("id", id)
            .select(orderSelect)
            .single();
          if (error) return res.status(500).json({ error: "Failed to update order" });
          return res.json({ ...data, recheck: "confirmed" });
        }

        if (isFailed && order.status === "pending") {
          const { data } = await supabaseAdmin
            .from("orders").update({ status: "failed" }).eq("id", id).select(orderSelect).single();
          return res.json({ ...data, recheck: "failed" });
        }

        return res.json({ ...order, recheck: statuses.join(",") || "unchanged" });
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/products ──────────────────────────────────────────────────
  if (route === "products") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("products").select("*").order("display_order", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "POST") {
      const body = req.body;
      const { data, error } = await supabaseAdmin.from("products").insert({
        slug: body.slug, name: body.name, full_name: body.full_name, category: body.category,
        tagline: body.tagline, description: body.description, long_description: body.long_description,
        card_bg: body.card_bg ?? "#f5f5f5", badge: body.badge ?? null,
        variants: body.variants ?? [], specs: body.specs ?? [],
        storage_instructions: body.storage_instructions ?? "", reconstitution_note: body.reconstitution_note ?? null,
        research_notes: body.research_notes ?? [], coa_href: body.coa_href ?? "",
        is_active: body.is_active ?? true, display_order: body.display_order ?? 99,
      }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { id, ...patch } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const { data, error } = await supabaseAdmin.from("products").update(patch).eq("id", id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const { error } = await supabaseAdmin.from("products").delete().eq("id", id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/upload ────────────────────────────────────────────────────
  if (route === "upload") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { filename, contentType } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    const path = `products/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data, error } = await supabaseAdmin.storage.from("product-images").createSignedUploadUrl(path);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ signedUrl: data.signedUrl, path, token: data.token });
  }

  return res.status(404).json({ error: "Not found" });
}
