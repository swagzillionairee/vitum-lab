import type { VercelRequest, VercelResponse } from "../_lib/http.js";
import { requireAdmin } from "../_lib/requireAdmin.js";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { sendOrderEvent, sendBackInStock, sendAffiliateCommission, deferEmail, type EmailOrder, type OrderEmailEvent } from "../_lib/email.js";
import { buyLabel, getTrackingStatus, shippoConfigured, shipFromConfigured, shipFromPhoneConfigured } from "../_lib/shippo.js";
import { getRewardConfig, earnLoyalty, grantReferralReward, releaseDiscountRedemption } from "../_lib/credit.js";
import { cancelOrder, confirmPaidOrder, sendConfirmationEmails, ORDER_COLS } from "../_lib/fulfillment.js";
import { squareConfigured } from "../_lib/square.js";
import { orderCashDue, round2 } from "../_lib/pricing.js";
import { isManualPaymentMethod } from "../_lib/paymentConfig.js";
import { estimateNowPaymentUsd, estimatedUsdCoversOrder, verifyNowPayment } from "../_lib/nowPayments.js";
import { VT_LOGO_PNG_B64 } from "../_lib/vt-logo.js";
import { formatOrderId } from "../_lib/orderId.js";

type ProductVariantInput = {
  id?: unknown;
  dose?: unknown;
  lot?: unknown;
  price?: unknown;
  sale_price?: unknown;
  sale_ends_at?: unknown;
  image_url?: unknown;
  cart_code?: unknown;
};

function safeAssetUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  if (!value) return true;
  return (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\//i.test(value);
}

function normalizeVariants(value: unknown): { ok: true; variants: Record<string, unknown>[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return { ok: false, error: "Products require 1 to 50 variants" };
  const seen = new Set<string>();
  const variants: Record<string, unknown>[] = [];
  for (const raw of value as ProductVariantInput[]) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid product variant" };
    const id = String(raw.id ?? "").trim();
    const dose = String(raw.dose ?? "").trim();
    const lot = String(raw.lot ?? "").trim();
    const cartCode = String(raw.cart_code ?? "").trim();
    const price = Number(raw.price);
    const salePrice = raw.sale_price == null || raw.sale_price === "" ? null : Number(raw.sale_price);
    const saleEndsAt = raw.sale_ends_at == null || raw.sale_ends_at === "" ? null : String(raw.sale_ends_at);
    if (!id || id.length > 100 || !dose || dose.length > 100 || lot.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(cartCode))
      return {
        ok: false,
        error: "Each variant needs valid id, dose, lot, and cart code fields",
      };
    if (seen.has(cartCode)) return { ok: false, error: `Duplicate cart code: ${cartCode}` };
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000 || round2(price) !== price) return { ok: false, error: `Invalid price for ${cartCode}` };
    if (salePrice != null && (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > price || round2(salePrice) !== salePrice)) return { ok: false, error: `Invalid sale price for ${cartCode}` };
    if (saleEndsAt != null && !Number.isFinite(Date.parse(saleEndsAt))) return { ok: false, error: `Invalid sale end date for ${cartCode}` };
    if (!safeAssetUrl(raw.image_url ?? "")) return { ok: false, error: `Invalid image URL for ${cartCode}` };
    seen.add(cartCode);
    variants.push({
      id,
      dose,
      lot,
      price,
      sale_price: salePrice,
      sale_ends_at: saleEndsAt,
      image_url: String(raw.image_url ?? ""),
      cart_code: cartCode,
    });
  }
  return { ok: true, variants };
}

// Notify (once) everyone on the back-in-stock waitlist for a cart_code that
// just went from 0 → in stock, then mark those rows notified.
async function notifyWaitlist(cartCode: string) {
  const { data: subs } = await supabaseAdmin.from("stock_waitlist").select("id, email").eq("cart_code", cartCode).is("notified_at", null);
  if (!subs || subs.length === 0) return;

  const { data: products } = await supabaseAdmin.from("products").select("name, slug, variants");
  let name = cartCode;
  let slug = "";
  let image: string | undefined;
  for (const p of products ?? []) {
    const v = (
      (p.variants as {
        cart_code?: string;
        dose?: string;
        image_url?: string;
      }[]) ?? []
    ).find(x => x.cart_code === cartCode);
    if (v) {
      name = `${p.name} ${v.dose ?? ""}`.trim();
      slug = p.slug as string;
      image = v.image_url;
      break;
    }
  }
  const baseUrl = process.env.BASE_URL || "https://vitumlab.com";
  const url = slug ? `${baseUrl}/shop/${slug}` : `${baseUrl}/shop`;

  for (const s of subs) {
    try {
      await sendBackInStock(s.email as string, { name, url, image });
    } catch (err) {
      console.error(`back-in-stock email failed for waitlist row ${s.id}:`, err);
    }
  }
  await supabaseAdmin.from("stock_waitlist").update({ notified_at: new Date().toISOString() }).eq("cart_code", cartCode).is("notified_at", null);
}

// Handles all /api/admin/* routes: inventory, orders, products, upload
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  // Parse route from URL — more reliable than req.query.slug with rewrites
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/admin\/?/, "").split("/")[0];

  // ── /api/admin/shipments — all orders that have a tracking number ──────────
  if (route === "shipments") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const all: {
      id: string;
      email: string;
      tracking_number: string | null;
      carrier: string | null;
      fulfillment_status: string | null;
      shipped_at: string | null;
      delivered_at: string | null;
    }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id, email, tracking_number, carrier, fulfillment_status, shipped_at, delivered_at")
        .not("tracking_number", "is", null)
        .order("shipped_at", { ascending: false, nullsFirst: false })
        .range(from, from + 999);
      if (error) return res.status(500).json({ error: "Failed to fetch shipments" });
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return res.json({ shipments: all });
  }

  // ── /api/admin/users — everyone who has signed in (Supabase Auth) ──────────
  if (route === "users") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const page = Math.max(1, parseInt((req.query?.page as string) || "1", 10));
    const perPage = 100;
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) return res.status(500).json({ error: "Failed to fetch users" });

    // Per-customer order count + lifetime spend (paid orders, matched by email).
    const spend: Record<string, { orders: number; spent: number }> = {};
    for (let from = 0; ; from += 1000) {
      const { data: batch } = await supabaseAdmin
        .from("orders")
        .select("email, net_amount")
        .in("status", ["confirmed", "finished"])
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      for (const o of batch ?? []) {
        const key = (o.email as string | null)?.toLowerCase() ?? "";
        if (!key) continue;
        if (!spend[key]) spend[key] = { orders: 0, spent: 0 };
        spend[key].orders += 1;
        spend[key].spent += Number(o.net_amount) || 0;
      }
      if (!batch || batch.length < 1000) break;
    }

    const users = (data.users ?? []).map((u: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; app_metadata?: Record<string, unknown> }) => {
      const s = spend[(u.email ?? "").toLowerCase()];
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        provider: (u.app_metadata?.provider as string) ?? null,
        orders: s?.orders ?? 0,
        spent: Math.round((s?.spent ?? 0) * 100) / 100,
      };
    });
    return res.json({
      users,
      page,
      perPage,
      total: (data as { total?: number }).total ?? null,
      hasMore: users.length === perPage,
    });
  }

  // ── /api/admin/summary ────────────────────────────────────────────────────
  if (route === "summary") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const LOW_STOCK_THRESHOLD = 5;
    const now = Date.now();
    const since = (days: number) => new Date(now - days * 86400000).toISOString();

    type OrderItem = {
      name: string;
      dose: string;
      quantity: number;
      cartCode: string;
      price: number;
    };
    type SummaryOrder = {
      status: string;
      fulfillment_status: string | null;
      net_amount: number | string;
      items: OrderItem[] | null;
      created_at: string;
      email: string | null;
      affiliate_id: string | null;
      payment_method: string | null;
      commission_amount: number | string | null;
      cancel_reason: string | null;
    };

    // Page through ALL orders — PostgREST caps a single response at 1000 rows, so a
    // plain select would silently under-count revenue/commission/repeat-rate/top
    // sellers once the store passes 1000 orders. Newest-first ordering is preserved.
    // (If orders ever reach the tens of thousands, move these aggregates into SQL.)
    const ORDER_COLS = "status, fulfillment_status, net_amount, items, created_at, email, affiliate_id, payment_method, commission_amount, cancel_reason";
    const ORDERS_PAGE = 1000;
    const fetchAllOrders = async (): Promise<SummaryOrder[]> => {
      const all: SummaryOrder[] = [];
      for (let from = 0; ; from += ORDERS_PAGE) {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .select(ORDER_COLS)
          .order("created_at", { ascending: false })
          .range(from, from + ORDERS_PAGE - 1);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as SummaryOrder[];
        all.push(...batch);
        if (batch.length < ORDERS_PAGE) break;
      }
      return all;
    };

    let rows: SummaryOrder[];
    let inventory: { cart_code: string; stock: number }[] | null;
    let affiliates: { id: string; code: string | null; name: string | null }[] | null;
    let payouts: { affiliate_id: string; amount: number | string }[] | null;
    try {
      const [orderRows, invRes, affRes, payRes] = await Promise.all([fetchAllOrders(), supabaseAdmin.from("inventory").select("cart_code, stock"), supabaseAdmin.from("affiliates").select("id, code, name").eq("is_referral", false), supabaseAdmin.from("affiliate_payouts").select("affiliate_id, amount")]);
      rows = orderRows;
      inventory = invRes.data;
      affiliates = affRes.data;
      payouts = payRes.data;
    } catch {
      return res.status(500).json({ error: "Failed to load summary data" });
    }

    const isPaid = (s: string) => s === "confirmed" || s === "finished";
    const num = (v: unknown) => Number(v) || 0;

    const paid = rows.filter(o => isPaid(o.status));
    const revenueAll = paid.reduce((sum, o) => sum + num(o.net_amount), 0);
    const since30 = since(30);
    const since7 = since(7);
    const revenue30 = paid.filter(o => o.created_at >= since30).reduce((sum, o) => sum + num(o.net_amount), 0);

    const ordersToFulfill = paid.filter(o => (o.fulfillment_status ?? "unfulfilled") === "unfulfilled").length;
    const pendingPayment = rows.filter(o => o.status === "pending").length;
    // Manual transfers awaiting the admin's verify + Mark paid.
    const awaitingManual = rows.filter(o => o.status === "pending" && ["zelle", "cashapp", "venmo", "ach"].includes(o.payment_method ?? "")).length;
    const ordersThisWeek = rows.filter(o => o.created_at >= since7).length;
    const aov = paid.length > 0 ? revenueAll / paid.length : 0;

    // Top sellers by quantity (from paid order line items)
    const productTally: Record<string, { name: string; dose: string; qty: number; revenue: number }> = {};
    for (const o of paid) {
      for (const it of o.items ?? []) {
        if (it.cartCode === "bac-water-free") continue;
        const key = it.cartCode || `${it.name} ${it.dose}`;
        if (!productTally[key])
          productTally[key] = {
            name: it.name,
            dose: it.dose,
            qty: 0,
            revenue: 0,
          };
        productTally[key].qty += it.quantity;
        productTally[key].revenue += (it.price || 0) * it.quantity;
      }
    }
    const topProducts = Object.values(productTally)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const lowStock = (inventory ?? [])
      .filter(r => r.stock <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.stock - b.stock)
      .map(r => ({ cartCode: r.cart_code, stock: r.stock }));
    const outOfStockCount = (inventory ?? []).filter(r => r.stock === 0).length;

    const recentOrders = rows.slice(0, 5).map(o => ({
      status: o.status,
      fulfillment_status: o.fulfillment_status,
      net_amount: num(o.net_amount),
      created_at: o.created_at,
    }));

    // ── Daily revenue, last 90 ET days (client slices to 10/30/60/90) ───────────
    const etDay = (iso: string) =>
      new Date(iso).toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      });
    const revByDay: Record<string, number> = {};
    for (const o of paid) {
      const k = etDay(o.created_at);
      revByDay[k] = (revByDay[k] ?? 0) + num(o.net_amount);
    }
    const dayKeys: string[] = [];
    // Anchor at noon UTC of today's ET date, then step back 24h at a time — DST-safe.
    let cursor = new Date(etDay(new Date(now).toISOString()) + "T12:00:00Z");
    for (let i = 0; i < 90; i++) {
      dayKeys.push(cursor.toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
      cursor = new Date(cursor.getTime() - 86400000);
    }
    dayKeys.reverse();
    const dailyRevenue = dayKeys.map(d => ({
      date: d,
      revenue: Math.round((revByDay[d] ?? 0) * 100) / 100,
    }));

    // ── Affiliate commissions owed = earned (paid orders) − recorded payouts ─────
    const affList = (affiliates ?? []) as {
      id: string;
      code: string | null;
      name: string | null;
    }[];
    const affById = new Map(affList.map(a => [a.id, a]));
    const commTally: Record<string, { amount: number; orders: number }> = {};
    for (const o of paid) {
      const aid = o.affiliate_id;
      const c = num(o.commission_amount);
      if (!aid || c <= 0) continue;
      if (!commTally[aid]) commTally[aid] = { amount: 0, orders: 0 };
      commTally[aid].amount += c;
      commTally[aid].orders += 1;
    }
    const paidOutTally: Record<string, number> = {};
    for (const p of payouts ?? []) {
      paidOutTally[p.affiliate_id] = (paidOutTally[p.affiliate_id] ?? 0) + num(p.amount);
    }
    // (round2 comes from _lib/pricing — the EPSILON-nudged money rounder; a
    // local copy here shadowed it and could drift a half-cent on owed totals.)
    const commissionsByAffiliate = [...new Set([...Object.keys(commTally), ...Object.keys(paidOutTally)])]
      .map(id => {
        const a = affById.get(id);
        const earned = commTally[id]?.amount ?? 0;
        const paidOut = paidOutTally[id] ?? 0;
        return {
          id,
          name: a?.name || a?.code || "Unknown affiliate",
          code: a?.code || "",
          amount: round2(earned),
          paid: round2(paidOut),
          owed: round2(earned - paidOut),
          orders: commTally[id]?.orders ?? 0,
        };
      })
      .sort((a, b) => b.owed - a.owed);
    const commissionsOwed = round2(commissionsByAffiliate.reduce((s, a) => s + Math.max(0, a.owed), 0));

    // ── Repeat-customer rate (share of paid orders from a returning email) ───────
    const paidAsc = [...paid].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const emailCounts: Record<string, number> = {};
    const seenEmail = new Set<string>();
    let repeatOrders = 0;
    for (const o of paidAsc) {
      const email = (o.email ?? "").toLowerCase().trim();
      if (!email) continue;
      if (seenEmail.has(email)) repeatOrders++;
      else seenEmail.add(email);
      emailCounts[email] = (emailCounts[email] ?? 0) + 1;
    }
    const repeatCustomers = Object.values(emailCounts).filter(n => n > 1).length;
    const totalCustomers = seenEmail.size;
    const repeatCustomerRate = paidAsc.length > 0 ? repeatOrders / paidAsc.length : 0;

    // ── Cancelled / abandoned in the last 30 days (auto-expired is a subset) ─────
    const cancelled30rows = rows.filter(o => o.status === "cancelled" && o.created_at >= since30);
    const cancelled30 = cancelled30rows.length;
    const autoExpired30 = cancelled30rows.filter(o => (o.cancel_reason ?? "").toLowerCase().startsWith("auto-expired")).length;

    // ── Net profit = merchandise net (already discount-adjusted) − affiliate
    // commission. Excludes shipping and product cost (COGS), neither of which
    // is tracked in the system. ──
    const commissionAll = paid.reduce((s, o) => s + num(o.commission_amount), 0);
    const commission30 = paid.filter(o => o.created_at >= since30).reduce((s, o) => s + num(o.commission_amount), 0);
    const netProfitAll = round2(revenueAll - commissionAll);
    const netProfit30 = round2(revenue30 - commission30);

    return res.json({
      revenue30,
      revenueAll,
      paidOrders: paid.length,
      aov,
      netProfitAll,
      netProfit30,
      ordersToFulfill,
      pendingPayment,
      awaitingManual,
      ordersThisWeek,
      lowStock,
      outOfStockCount,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      topProducts,
      recentOrders,
      dailyRevenue,
      commissionsOwed,
      commissionsByAffiliate,
      repeatCustomerRate,
      repeatCustomers,
      totalCustomers,
      cancelled30,
      autoExpired30,
    });
  }

  // ── /api/admin/inventory ──────────────────────────────────────────────────
  // ── /api/admin/waitlist — pending back-in-stock counts per cart_code ───────
  if (route === "waitlist") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const { data, error } = await supabaseAdmin.from("stock_waitlist").select("cart_code").is("notified_at", null);
    if (error) return res.status(500).json({ error: "Failed to fetch waitlist" });
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.cart_code as string] = (counts[r.cart_code as string] ?? 0) + 1;
    return res.json({ counts });
  }

  if (route === "inventory") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("inventory").select("cart_code, stock, is_active, updated_at").order("cart_code");
      if (error) return res.status(500).json({ error: "Failed to fetch inventory" });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { cartCode, stock, isActive } = req.body as {
        cartCode?: string;
        stock?: number;
        isActive?: boolean;
      };
      if (typeof cartCode !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(cartCode)) return res.status(400).json({ error: "A valid cartCode is required" });
      if (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0)) return res.status(400).json({ error: "stock must be a non-negative whole number" });
      if (isActive !== undefined && typeof isActive !== "boolean") return res.status(400).json({ error: "isActive must be boolean" });

      // Read prior stock so we can detect a 0 → in-stock restock (waitlist trigger).
      let priorStock: number | null = null;
      if (typeof stock === "number") {
        const { data: prior } = await supabaseAdmin.from("inventory").select("stock").eq("cart_code", cartCode).maybeSingle();
        priorStock = prior?.stock ?? null;
      }

      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof stock === "number") {
        update.stock = stock;
      }
      if (typeof isActive === "boolean") update.is_active = isActive;
      const { data, error } = await supabaseAdmin.from("inventory").update(update).eq("cart_code", cartCode).select().maybeSingle();
      if (error || !data) return res.status(500).json({ error: "Failed to update inventory" });

      // Restocked from zero → email the back-in-stock waitlist (non-blocking).
      if (typeof stock === "number" && stock > 0 && priorStock === 0) {
        deferEmail(notifyWaitlist(cartCode));
      }
      return res.json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/orders ────────────────────────────────────────────────────
  if (route === "orders") {
    const orderSelect = "id, email, items, gross_amount, discount_amount, net_amount, shipping_amount, discount_code, discount_breakdown, credit_applied, referral_code, affiliate_id, commission_amount, status, fulfillment_status, payment_method, tracking_number, carrier, label_url, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, shipping_address, created_at, confirmed_at, emails_sent";

    // Sends an order email and reloads emails_sent so the response reflects the
    // new stamp. Email failures never fail the admin action.
    const emailAndRefresh = async <T extends { id: string; emails_sent?: Record<string, string> | null }>(order: T, event: OrderEmailEvent, opts?: { force?: boolean; wasPending?: boolean }): Promise<T> => {
      try {
        await sendOrderEvent(order as unknown as EmailOrder, event, opts);
        const { data } = await supabaseAdmin.from("orders").select("emails_sent").eq("id", order.id).maybeSingle();
        if (data) order.emails_sent = data.emails_sent;
      } catch (err) {
        console.error(`admin: ${event} email failed for ${order.id}:`, err);
      }
      return order;
    };

    if (req.method === "GET") {
      const page = Math.max(1, parseInt((req.query?.page as string) || "1", 10));
      const perPage = Math.min(2000, Math.max(1, parseInt((req.query?.perPage as string) || "25", 10)));
      // Strip PostgREST .or() metacharacters (`,()*\`) so a search term can't
      // alter the filter's structure (admin-only, but keep it well-formed).
      const search = ((req.query?.search as string) || "").replace(/[,()*\\]/g, " ").trim();
      const statusFilter = (req.query?.status as string) || "";
      const fulfillmentFilter = (req.query?.fulfillment as string) || "";
      // "awaiting=1" → pending orders on a manual method (the ones the admin
      // must verify + Mark paid). Overrides the status filter when set.
      const awaitingFilter = (req.query?.awaiting as string) === "1";
      const from = (page - 1) * perPage;

      let query = supabaseAdmin.from("orders").select(orderSelect, { count: "exact" }).order("created_at", { ascending: false });

      if (search) query = query.or(`email.ilike.%${search}%,id.ilike.%${search}%`);
      if (awaitingFilter) {
        query = query.eq("status", "pending").in("payment_method", ["zelle", "cashapp", "venmo", "ach"]);
      } else if (statusFilter) {
        query = query.eq("status", statusFilter);
      }
      if (fulfillmentFilter) query = query.eq("fulfillment_status", fulfillmentFilter);

      const { data, error, count } = await query.range(from, from + perPage - 1);
      if (error) return res.status(500).json({ error: "Failed to fetch orders" });
      return res.json({ orders: data, total: count ?? 0, page, perPage });
    }

    // Order actions: cancel | ship | deliver | recheck | notes
    if (req.method === "PATCH") {
      const body = req.body as {
        id?: string;
        action?: "cancel" | "ship" | "buy_label" | "deliver" | "recheck" | "notes" | "resend_email" | "mark_paid";
        reason?: string;
        tracking_number?: string;
        carrier?: string;
        admin_notes?: string;
        event?: string;
      };
      const { id, action } = body;
      if (!id || !action) return res.status(400).json({ error: "id and action are required" });

      const { data: order, error: fetchErr } = await supabaseAdmin.from("orders").select(orderSelect).eq("id", id).maybeSingle();
      if (fetchErr || !order) return res.status(404).json({ error: "Order not found" });

      const PAID = ["confirmed", "finished"];

      if (action === "cancel") {
        if (order.status === "cancelled") return res.status(409).json({ error: "Order is already cancelled" });
        const wasPending = order.status === "pending";
        const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : "Cancelled by admin";
        try {
          if (!(await cancelOrder(order, reason))) {
            return res.status(409).json({
              error: "Order changed while cancelling - refresh and try again",
            });
          }
        } catch (error) {
          console.error("Admin cancel failed:", error);
          return res.status(500).json({ error: "Failed to cancel order" });
        }
        const { data } = await supabaseAdmin.from("orders").select(orderSelect).eq("id", id).maybeSingle();
        if (!data) return res.status(404).json({ error: "Cancelled order could not be reloaded" });
        return res.json(await emailAndRefresh(data, "cancelled", { wasPending }));
      }

      if (action === "ship") {
        if (!PAID.includes(order.status) || order.fulfillment_status !== "unfulfilled") {
          return res.status(409).json({
            error: "Only a paid, unfulfilled order can be marked shipped",
          });
        }
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
          .in("status", PAID)
          .eq("fulfillment_status", "unfulfilled")
          .select(orderSelect)
          .maybeSingle();
        if (error) return res.status(500).json({ error: "Failed to mark shipped" });
        if (!data)
          return res.status(409).json({
            error: "Order changed while shipping - refresh and try again",
          });
        return res.json(await emailAndRefresh(data, "shipped"));
      }

      if (action === "buy_label") {
        if (!PAID.includes(order.status)) return res.status(400).json({ error: "Order must be paid before buying a label" });
        if (order.fulfillment_status !== "unfulfilled" || order.label_url)
          return res.status(409).json({
            error: "Order already has a label or is no longer unfulfilled",
          });
        if (!shippoConfigured()) return res.status(400).json({ error: "SHIPPO_API_KEY is not set in the environment" });
        if (!shipFromConfigured())
          return res.status(400).json({
            error: "Set the ship-from address env vars (SHIP_FROM_STREET1/CITY/STATE/ZIP) before buying labels",
          });
        if (!shipFromPhoneConfigured())
          return res.status(400).json({
            error: "USPS requires a sender phone — add SHIP_FROM_PHONE in Vercel (any number you can be reached at). The sender email is auto-filled from your store email.",
          });
        let label;
        try {
          label = await buyLabel(
            order as {
              email: string;
              shipping_address?: Record<string, string> | null;
            }
          );
        } catch (err) {
          console.error("buy_label failed:", err);
          return res.status(502).json({
            error: err instanceof Error ? err.message : "Shippo label purchase failed",
          });
        }
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({
            fulfillment_status: "shipped",
            tracking_number: label.tracking_number,
            carrier: label.carrier,
            label_url: label.label_url,
            shipped_at: new Date().toISOString(),
          })
          .eq("id", id)
          .in("status", PAID)
          .eq("fulfillment_status", "unfulfilled")
          .is("label_url", null)
          .select(orderSelect)
          .maybeSingle();
        if (error) return res.status(500).json({ error: "Label purchased but failed to save to the order" });
        if (!data)
          return res.status(409).json({
            error: "Label purchased but the order changed; contact Shippo support before retrying",
          });
        return res.json(await emailAndRefresh(data, "shipped"));
      }

      if (action === "deliver") {
        if (!PAID.includes(order.status) || order.fulfillment_status !== "shipped") {
          return res.status(409).json({
            error: "Only a paid, shipped order can be marked delivered",
          });
        }
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({
            fulfillment_status: "delivered",
            delivered_at: new Date().toISOString(),
          })
          .eq("id", id)
          .in("status", PAID)
          .eq("fulfillment_status", "shipped")
          .select(orderSelect)
          .maybeSingle();
        if (error) return res.status(500).json({ error: "Failed to mark delivered" });
        if (!data)
          return res.status(409).json({
            error: "Order changed while delivering - refresh and try again",
          });
        await emailAndRefresh(data, "delivered");
        return res.json(await emailAndRefresh(data, "admin_delivered"));
      }

      // Manual-payment confirmation: the admin verified the Zelle/Cash App/Venmo/
      // ACH transfer landed → confirm the order. Reuses the shared ATOMIC confirm
      // path (pending→confirmed claim + stock + promo + loyalty/referral), so it
      // can't double-fulfill and is a no-op if already confirmed.
      if (action === "mark_paid") {
        if (order.status !== "pending") return res.status(409).json({ error: "Only a pending order can be marked paid" });
        if (!isManualPaymentMethod(String(order.payment_method ?? ""))) {
          return res.status(400).json({ error: "Only a manual-transfer order can be marked paid" });
        }
        const { data: full } = await supabaseAdmin.from("orders").select(ORDER_COLS).eq("id", id).maybeSingle();
        if (!full) return res.status(404).json({ error: "Order not found" });
        const amountDue = orderCashDue(order.net_amount, order.shipping_amount, order.credit_applied);
        try {
          if (
            !(await confirmPaidOrder(full, {
              payCurrency: "USD",
              payAmount: amountDue,
              paymentId: null,
            }))
          ) {
            return res.status(409).json({
              error: "Order changed while being marked paid - refresh and try again",
            });
          }
        } catch (error) {
          console.error("Manual payment confirmation failed:", error);
          return res.status(409).json({
            error: "Payment was not confirmed because inventory could not be reserved. Review stock and the received transfer.",
          });
        }
        await sendConfirmationEmails(full);
        const { data } = await supabaseAdmin.from("orders").select(orderSelect).eq("id", id).single();
        return res.json(data);
      }

      if (action === "resend_email") {
        const allowed: OrderEmailEvent[] = ["order_created", "confirmed", "shipped", "delivered", "cancelled", "failed", "admin_new_order", "admin_delivered", "followup"];
        const event = body.event as OrderEmailEvent;
        if (!allowed.includes(event)) return res.status(400).json({ error: "Unknown email event" });
        const refreshed = await emailAndRefresh({ ...order }, event, {
          force: true,
        });
        return res.json(refreshed);
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
        if (order.payment_method !== "crypto") return res.status(400).json({ error: "Re-check is only available for crypto orders" });
        // Reconcile against NowPayments in case an IPN webhook was missed.
        const apiKey = process.env.NOWPAYMENTS_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "NOWPAYMENTS_API_KEY not configured" });

        const np = await fetch("https://api.nowpayments.io/v1/payment/?limit=500&page=0&sortBy=created_at&orderBy=desc", { headers: { "x-api-key": apiKey } });
        if (!np.ok) return res.status(502).json({ error: "Failed to reach NowPayments" });

        const list = (await np.json()) as {
          data?: {
            order_id?: string;
            payment_status?: string;
            price_currency?: string;
            price_amount?: number;
            pay_currency?: string;
            pay_amount?: number;
            actually_paid?: number;
            payment_id?: number | string;
          }[];
        };
        const matches = (list.data ?? []).filter(p => p.order_id === id);
        if (matches.length === 0) return res.json({ ...order, recheck: "no_payment_found" });

        const statuses = matches.map(m => m.payment_status ?? "");
        const isPaid = statuses.some(s => s === "finished");
        const isFailed = statuses.every(s => s === "failed" || s === "expired" || s === "refunded");

        if (isPaid && order.status === "pending") {
          // Reuse the shared ATOMIC confirm path (pending→confirmed claim +
          // stock + promo + rewards) — the same one the webhooks use. The old
          // inline version here decremented stock with no claim, so a Re-check
          // racing an IPN (or two rapid clicks) double-decremented stock and
          // double-counted the promo.
          const paid = matches.find(m => m.payment_status === "finished");
          if (!paid) return res.json({ ...order, recheck: "awaiting_finished" });
          const amountCheck = verifyNowPayment(paid, order);
          if (!amountCheck.ok)
            return res.status(409).json({
              error: `Payment found but not fulfilled: ${amountCheck.reason}`,
            });
          const estimatedUsd = await estimateNowPaymentUsd(paid, apiKey).catch(() => null);
          const dueUsd = orderCashDue(order.net_amount, order.shipping_amount, order.credit_applied);
          if (!estimatedUsdCoversOrder(estimatedUsd, dueUsd))
            return res.status(409).json({
              error: "Payment found, but the actually received asset could not be verified against the order value",
            });
          const { data: full } = await supabaseAdmin.from("orders").select(ORDER_COLS).eq("id", id).maybeSingle();
          if (full) {
            try {
              const claimed = await confirmPaidOrder(full, {
                payCurrency: paid.pay_currency ?? null,
                payAmount: paid.actually_paid ?? paid.pay_amount ?? null,
                paymentId: paid.payment_id != null ? String(paid.payment_id) : null,
              });
              if (!claimed)
                return res.status(409).json({
                  error: "Order changed during re-check - refresh and try again",
                });
              await sendConfirmationEmails(full);
            } catch (error) {
              console.error("Crypto re-check fulfillment failed:", error);
              return res.status(409).json({
                error: "Payment is finished, but inventory could not be reserved. Fulfill or refund manually.",
              });
            }
          }
          const { data } = await supabaseAdmin.from("orders").select(orderSelect).eq("id", id).single();
          return res.json({ ...data, recheck: "confirmed" });
        }

        if (isFailed && order.status === "pending") {
          const { data } = await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", id).eq("status", "pending").select(orderSelect).maybeSingle();
          if (data) {
            await releaseDiscountRedemption(id).catch(() => {});
            await emailAndRefresh(data, "failed");
          }
          return res.json({ ...data, recheck: "failed" });
        }

        return res.json({
          ...order,
          recheck: statuses.join(",") || "unchanged",
        });
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    // Permanently delete one or more orders (hard delete). Does NOT restock —
    // use the Cancel action to restock a paid order. Bulk: pass { ids: [...] }.
    if (req.method === "DELETE") {
      const body = req.body as { id?: string; ids?: string[] };
      const ids = [...new Set((body.ids?.length ? body.ids : body.id ? [body.id] : []).filter((value): value is string => typeof value === "string" && value.length > 0))].slice(0, 100);
      if (ids.length === 0) return res.status(400).json({ error: "id or ids required" });
      const { data: candidates, error: readError } = await supabaseAdmin.from("orders").select("id, status").in("id", ids);
      if (readError) return res.status(500).json({ error: "Failed to inspect orders" });
      if ((candidates ?? []).length !== ids.length || (candidates ?? []).some((row: { status: string | null }) => row.status !== "failed" && row.status !== "cancelled")) {
        return res.status(409).json({
          error: "Only failed or cancelled orders can be permanently deleted",
        });
      }
      for (const orderId of ids) await releaseDiscountRedemption(orderId).catch(() => {});
      const { data: deleted, error } = await supabaseAdmin.from("orders").delete().in("id", ids).in("status", ["failed", "cancelled"]).select("id");
      if (error) return res.status(500).json({ error: "Failed to delete orders" });
      return res.json({ ok: true, deleted: deleted?.length ?? 0 });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/order-pdfs — combined 4×6 labels OR packing slips (bulk) ─────
  if (route === "order-pdfs") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { ids, type } = req.body as {
      ids?: string[];
      type?: "labels" | "slips";
    };
    if (!ids?.length) return res.status(400).json({ error: "No orders selected" });
    if (type !== "labels" && type !== "slips") return res.status(400).json({ error: "Invalid PDF type" });

    const { data: rows } = await supabaseAdmin.from("orders").select("id, email, items, net_amount, shipping_amount, shipping_address, label_url, tracking_number, carrier, created_at").in("id", ids.slice(0, 100));
    const orders = ids.map(id => (rows ?? []).find((r: { id: string }) => r.id === id)).filter(Boolean) as Array<{
      id: string;
      items: { name: string; dose: string; quantity: number; cartCode?: string }[] | null;
      net_amount: number | string;
      shipping_amount: number | string | null;
      shipping_address: Record<string, string> | null;
      label_url: string | null;
      tracking_number: string | null;
      carrier: string | null;
      created_at: string;
    }>;
    if (orders.length === 0) return res.status(404).json({ error: "Orders not found" });

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

    if (type === "labels") {
      const merged = await PDFDocument.create();
      let included = 0;
      const skipped: string[] = [];
      for (const o of orders) {
        if (!o.label_url) {
          skipped.push(o.id.slice(0, 8));
          continue;
        }
        try {
          const buf = await fetch(o.label_url).then(r => r.arrayBuffer());
          const src = await PDFDocument.load(buf);
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(p => merged.addPage(p));
          included++;
        } catch {
          skipped.push(o.id.slice(0, 8));
        }
      }
      if (included === 0)
        return res.status(400).json({
          error: "None of the selected orders have a label yet — buy labels first.",
        });
      const bytes = await merged.save();
      return res.json({
        pdf: Buffer.from(bytes).toString("base64"),
        included,
        skipped,
      });
    }

    // Packing slips — clean black-on-white 4×6 slips (thermal-printer friendly).
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const money = (n: number | string | null) => `$${(Number(n) || 0).toFixed(2)}`;
    const logo = await doc.embedPng(Buffer.from(VT_LOGO_PNG_B64, "base64"));

    const PW = 288,
      PH = 432,
      M = 20; // 4×6 inches in points
    const black = rgb(0, 0, 0);
    const LOGO_H = 26;
    const LOGO_W = (logo.width / logo.height) * LOGO_H;
    const CONTENT_TOP = PH - M - LOGO_H - 42;
    const FOOT = 30; // reserved footer zone
    // Drop characters Helvetica (WinAnsi) can't encode, so a stray glyph never breaks the PDF.
    const clean = (s: string) => String(s).replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, "");

    const wrap = (s: string, size: number, maxW: number): string[] => {
      const words = clean(s).split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (cur && bold.widthOfTextAtSize(test, size) > maxW) {
          lines.push(cur);
          cur = w;
        } else cur = test;
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    };

    const initPage = (pg: ReturnType<typeof doc.addPage>) => {
      const logoY = PH - M - LOGO_H;
      pg.drawImage(logo, { x: M, y: logoY, width: LOGO_W, height: LOGO_H });
      pg.drawText("Vitum Lab", {
        x: M + LOGO_W + 9,
        y: logoY + LOGO_H / 2 - 6,
        size: 16,
        font: bold,
        color: black,
      });
      pg.drawText("PACKING SLIP", {
        x: M,
        y: logoY - 17,
        size: 10,
        font: bold,
        color: black,
      });
      pg.drawLine({
        start: { x: M, y: logoY - 25 },
        end: { x: PW - M, y: logoY - 25 },
        thickness: 1,
        color: black,
      });
      pg.drawText("FOR RESEARCH USE ONLY", {
        x: M,
        y: 21,
        size: 8,
        font: bold,
        color: black,
      });
      pg.drawText("vitumlab.com", {
        x: M,
        y: 11,
        size: 8,
        font: bold,
        color: black,
      });
    };

    for (const o of orders) {
      let page = doc.addPage([PW, PH]);
      initPage(page);
      let y = CONTENT_TOP;

      const need = (h: number) => {
        if (y - h < FOOT) {
          page = doc.addPage([PW, PH]);
          initPage(page);
          y = CONTENT_TOP;
        }
      };
      const text = (s: string, size: number, x = M) => {
        need(size);
        page.drawText(clean(s), { x, y, size, font: bold, color: black });
        y -= size + 4;
      };
      const hr = () => {
        need(7);
        page.drawLine({
          start: { x: M, y: y + 4 },
          end: { x: PW - M, y: y + 4 },
          thickness: 0.8,
          color: black,
        });
        y -= 8;
      };

      // Order meta
      text(`Order ${formatOrderId(o.id)}`, 11);
      text(`Date: ${new Date(o.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`, 9);
      if (o.tracking_number) for (const w of wrap(`Tracking: ${o.carrier || "USPS"} ${o.tracking_number}`, 9, PW - 2 * M)) text(w, 9);
      hr();

      // Ship to
      text("SHIP TO", 9);
      const a = o.shipping_address || {};
      const addrLines = [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : ""), a.country].filter(l => l && String(l).trim());
      for (const l of addrLines) for (const w of wrap(String(l), 10, PW - 2 * M)) text(w, 10);
      hr();

      // Items (qty + wrapped name)
      text("ITEMS", 9);
      const nameX = M + 24;
      for (const it of o.items ?? []) {
        const isFree = it.cartCode === "bac-water-free";
        const lines = wrap(`${it.name} ${it.dose}${isFree ? " (free gift)" : ""}`, 10, PW - M - nameX);
        need(10);
        page.drawText(`${it.quantity}x`, {
          x: M,
          y,
          size: 10,
          font: bold,
          color: black,
        });
        lines.forEach((ln, i) => {
          if (i > 0) need(10);
          page.drawText(ln, {
            x: nameX,
            y,
            size: 10,
            font: bold,
            color: black,
          });
          y -= 10 + (i === lines.length - 1 ? 6 : 2);
        });
      }
      hr();

      // Total
      need(15);
      page.drawText("TOTAL", { x: M, y, size: 13, font: bold, color: black });
      const tot = money((Number(o.net_amount) || 0) + (Number(o.shipping_amount) || 0));
      page.drawText(tot, {
        x: PW - M - bold.widthOfTextAtSize(tot, 13),
        y,
        size: 13,
        font: bold,
        color: black,
      });
      y -= 18;
    }
    const bytes = await doc.save();
    return res.json({ pdf: Buffer.from(bytes).toString("base64") });
  }

  // ── /api/admin/referral-program — self-serve referral config (bounty + buyer
  // discount). Editing the buyer discount re-syncs it onto every referral code. ─
  if (route === "referral-program") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("store_settings").select("referral_program_active, referral_buyer_discount, referral_bounty_amount, referral_bounty_orders, referral_min_order").maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load referral config" });
      return res.json(
        data ?? {
          referral_program_active: false,
          referral_buyer_discount: 10,
          referral_bounty_amount: 100,
          referral_bounty_orders: 5,
          referral_min_order: 0,
        }
      );
    }
    if (req.method === "PUT") {
      const b = req.body ?? {};
      const active = !!b.active;
      const buyerDiscountRaw = Number(b.buyer_discount);
      const bountyAmountRaw = Number(b.bounty_amount);
      const bountyOrdersRaw = Number(b.bounty_orders);
      const minOrderRaw = Number(b.min_order);
      if (!Number.isFinite(buyerDiscountRaw) || buyerDiscountRaw < 0 || buyerDiscountRaw > 100 || !Number.isSafeInteger(buyerDiscountRaw))
        return res.status(400).json({
          error: "Buyer discount must be a whole percentage from 0 to 100",
        });
      if (!Number.isFinite(bountyAmountRaw) || bountyAmountRaw < 0 || round2(bountyAmountRaw) !== bountyAmountRaw || !Number.isFinite(minOrderRaw) || minOrderRaw < 0 || round2(minOrderRaw) !== minOrderRaw)
        return res.status(400).json({
          error: "Referral dollar amounts must be non-negative with at most two decimals",
        });
      if (!Number.isSafeInteger(bountyOrdersRaw) || bountyOrdersRaw < 1) return res.status(400).json({ error: "Bounty orders must be a positive whole number" });
      const buyerDiscount = buyerDiscountRaw;
      const bountyAmount = bountyAmountRaw;
      const bountyOrders = bountyOrdersRaw;
      const minOrder = minOrderRaw;
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .upsert(
          {
            id: true,
            referral_program_active: active,
            referral_buyer_discount: buyerDiscount,
            referral_bounty_amount: bountyAmount,
            referral_bounty_orders: bountyOrders,
            referral_min_order: minOrder,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("referral_program_active, referral_buyer_discount, referral_bounty_amount, referral_bounty_orders, referral_min_order")
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      // Re-sync the buyer discount onto every existing referral code so a change
      // applies retroactively (checkout reads discount_percent per affiliate row).
      await supabaseAdmin.from("affiliates").update({ discount_percent: buyerDiscount }).eq("is_referral", true);
      return res.json(data);
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/payment-config — Square + manual (Zelle/Cash App/Venmo/ACH)
  // + crypto method config. Handles are shown to customers, so keep them clean. ─
  if (route === "payment-config") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("store_settings").select("payment_config").maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load payment config" });
      return res.json({
        payment_config: data?.payment_config ?? {},
        square_configured: squareConfigured(),
      });
    }
    if (req.method === "PUT") {
      const b = (req.body?.payment_config ?? {}) as Record<string, any>;
      const manual = (k: string) => ({
        enabled: !!b[k]?.enabled,
        handle: String(b[k]?.handle ?? "")
          .slice(0, 200)
          .trim(),
        instructions: String(b[k]?.instructions ?? "").slice(0, 500),
      });
      const payment_config = {
        square: { enabled: !!b.square?.enabled },
        zelle: manual("zelle"),
        cashapp: manual("cashapp"),
        venmo: manual("venmo"),
        ach: manual("ach"),
        crypto: { enabled: b.crypto?.enabled !== false },
      };
      const { data, error } = await supabaseAdmin.from("store_settings").upsert({ id: true, payment_config, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("payment_config").maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      return res.json({
        payment_config: data?.payment_config ?? payment_config,
        square_configured: squareConfigured(),
      });
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/affiliates ────────────────────────────────────────────────
  if (route === "affiliates") {
    if (req.method === "GET") {
      const [{ data: affs, error }, { data: payouts }] = await Promise.all([supabaseAdmin.from("affiliates").select("id, email, code, name, discount_percent, commission_percent, created_at").eq("is_referral", false).order("created_at"), supabaseAdmin.from("affiliate_payouts").select("id, affiliate_id, amount, note, created_at").order("created_at", { ascending: false })]);
      if (error) return res.status(500).json({ error: "Failed to fetch affiliates" });

      // Earned = commission on paid orders, paged past the 1000-row cap.
      const earnedTally: Record<string, { earned: number; orders: number }> = {};
      for (let from = 0; ; from += 1000) {
        const { data: batch } = await supabaseAdmin
          .from("orders")
          .select("affiliate_id, commission_amount")
          .in("status", ["confirmed", "finished"])
          .not("affiliate_id", "is", null)
          .order("created_at", { ascending: true })
          .range(from, from + 999);
        for (const o of batch ?? []) {
          const aid = o.affiliate_id as string;
          if (!earnedTally[aid]) earnedTally[aid] = { earned: 0, orders: 0 };
          earnedTally[aid].earned += Number(o.commission_amount) || 0;
          earnedTally[aid].orders += 1;
        }
        if (!batch || batch.length < 1000) break;
      }

      const round2 = (n: number) => Math.round(n * 100) / 100;
      type AffiliateRow = { id: string; [key: string]: unknown };
      type PayoutRow = {
        affiliate_id: string;
        amount: number | string | null;
        [key: string]: unknown;
      };
      const result = (affs ?? []).map((a: AffiliateRow) => {
        const rows = (payouts ?? []).filter((p: PayoutRow) => p.affiliate_id === a.id);
        const paidOut = rows.reduce((s: number, p: PayoutRow) => s + (Number(p.amount) || 0), 0);
        const earned = earnedTally[a.id]?.earned ?? 0;
        return {
          ...a,
          orders: earnedTally[a.id]?.orders ?? 0,
          earned: round2(earned),
          paid: round2(paidOut),
          owed: round2(earned - paidOut),
          payouts: rows,
        };
      });
      return res.json(result);
    }

    // Percent fields are money-critical: a negative discount silently SURCHARGES
    // customers (the discount line is hidden when ≤ 0) and >100 makes orders free.
    // Clamp server-side regardless of what the admin UI sends.
    const clampPct = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    if (req.method === "POST") {
      const { email, code, name, discount_percent, commission_percent } = req.body ?? {};
      const normalizedEmail = String(email ?? "")
        .trim()
        .toLowerCase();
      const normalizedCode = String(code ?? "")
        .trim()
        .toUpperCase();
      if (normalizedEmail.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail) || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(normalizedCode)) return res.status(400).json({ error: "A valid email and code are required" });
      if (name != null && (typeof name !== "string" || name.length > 200)) return res.status(400).json({ error: "Affiliate name is too long" });
      const { data, error } = await supabaseAdmin
        .from("affiliates")
        .insert({
          email: normalizedEmail,
          code: normalizedCode,
          name: typeof name === "string" ? name.trim() || null : null,
          discount_percent: clampPct(discount_percent),
          commission_percent: clampPct(commission_percent),
        })
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { id, ...patch } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "id required" });
      const allowed: Record<string, unknown> = {};
      for (const k of ["name", "code", "email", "discount_percent", "commission_percent"]) {
        if (patch[k] === undefined) continue;
        allowed[k] = k === "code" ? String(patch[k]).toUpperCase().trim() : k === "discount_percent" || k === "commission_percent" ? clampPct(patch[k]) : patch[k];
      }
      if (allowed.code !== undefined && !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(String(allowed.code))) return res.status(400).json({ error: "Invalid affiliate code" });
      if (allowed.email !== undefined) {
        const normalizedEmail = String(allowed.email).trim().toLowerCase();
        if (normalizedEmail.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) return res.status(400).json({ error: "Invalid affiliate email" });
        allowed.email = normalizedEmail;
      }
      if (allowed.name !== undefined && (typeof allowed.name !== "string" || allowed.name.length > 200)) return res.status(400).json({ error: "Affiliate name is too long" });
      const { data, error } = await supabaseAdmin.from("affiliates").update(allowed).eq("id", id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "id required" });
      // Curated affiliates only (the tab never lists self-serve referral codes).
      // affiliate_payouts cascades; orders keep their affiliate_id/commission
      // history (no FK) so past revenue reporting is unaffected.
      const { error } = await supabaseAdmin.from("affiliates").delete().eq("id", id).eq("is_referral", false);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/payouts ───────────────────────────────────────────────────
  if (route === "payouts") {
    if (req.method === "POST") {
      const { affiliateId, amount, note } = req.body ?? {};
      const amt = Number(amount);
      if (typeof affiliateId !== "string" || !affiliateId || !Number.isFinite(amt) || amt <= 0 || round2(amt) !== amt) {
        return res.status(400).json({
          error: "affiliateId and a positive amount with at most two decimals are required",
        });
      }
      if (note != null && (typeof note !== "string" || note.length > 500)) return res.status(400).json({ error: "Payout note is too long" });

      const { data: affiliate } = await supabaseAdmin.from("affiliates").select("commission_percent").eq("id", affiliateId).maybeSingle();
      if (!affiliate) return res.status(404).json({ error: "Affiliate not found" });
      let earned = 0;
      let paid = 0;
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await supabaseAdmin
          .from("orders")
          .select("net_amount, commission_amount")
          .eq("affiliate_id", affiliateId)
          .in("status", ["confirmed", "finished"])
          .order("created_at", { ascending: true })
          .range(from, from + 999);
        if (error) return res.status(500).json({ error: "Failed to calculate affiliate earnings" });
        for (const row of rows ?? []) earned += Number(row.commission_amount ?? (Number(row.net_amount || 0) * Number(affiliate.commission_percent || 0)) / 100) || 0;
        if (!rows || rows.length < 1000) break;
      }
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await supabaseAdmin
          .from("affiliate_payouts")
          .select("amount")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: true })
          .range(from, from + 999);
        if (error) return res.status(500).json({ error: "Failed to calculate prior payouts" });
        for (const row of rows ?? []) paid += Number(row.amount) || 0;
        if (!rows || rows.length < 1000) break;
      }
      const outstanding = round2(Math.max(0, earned - paid));
      if (amt > outstanding)
        return res.status(409).json({
          error: `Payout exceeds the $${outstanding.toFixed(2)} outstanding commission`,
        });
      const { data, error } = await supabaseAdmin.rpc("record_affiliate_payout", {
        p_affiliate_id: affiliateId,
        p_amount: amt,
        p_note: typeof note === "string" ? note.trim() || null : null,
      });
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "id required" });
      const { error } = await supabaseAdmin.from("affiliate_payouts").delete().eq("id", id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/promos ────────────────────────────────────────────────────
  if (route === "promos") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("promo_codes").select("*").order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: "Failed to fetch promo codes" });
      return res.json(data);
    }

    if (req.method === "POST") {
      const { code, percent_off, min_subtotal, max_uses, starts_at, expires_at, is_active, per_customer_limit } = req.body ?? {};
      const pct = Number(percent_off);
      const normalizedCode = String(code ?? "")
        .trim()
        .toUpperCase();
      const minSubtotal = Number(min_subtotal ?? 0);
      const maxUses = max_uses != null && max_uses !== "" ? Number(max_uses) : null;
      const customerLimit = per_customer_limit != null && per_customer_limit !== "" ? Number(per_customer_limit) : 1;
      if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(normalizedCode) || !Number.isFinite(pct) || pct < 1 || pct > 100) return res.status(400).json({ error: "Enter a valid code and percent_off from 1 to 100" });
      if (!Number.isFinite(minSubtotal) || minSubtotal < 0 || round2(minSubtotal) !== minSubtotal) return res.status(400).json({ error: "min_subtotal must be a non-negative dollar amount" });
      if (maxUses != null && (!Number.isSafeInteger(maxUses) || maxUses < 1)) return res.status(400).json({ error: "max_uses must be a positive whole number or blank" });
      if (!Number.isSafeInteger(customerLimit) || customerLimit < 0)
        return res.status(400).json({
          error: "per_customer_limit must be a non-negative whole number",
        });
      if ((starts_at && !Number.isFinite(Date.parse(starts_at))) || (expires_at && !Number.isFinite(Date.parse(expires_at))) || (starts_at && expires_at && Date.parse(starts_at) > Date.parse(expires_at))) return res.status(400).json({ error: "Promo dates are invalid" });
      if (is_active != null && typeof is_active !== "boolean") return res.status(400).json({ error: "is_active must be boolean" });
      const { data, error } = await supabaseAdmin
        .from("promo_codes")
        .insert({
          code: normalizedCode,
          percent_off: pct,
          min_subtotal: minSubtotal,
          max_uses: maxUses,
          // Uses allowed per customer (0 = unlimited). Defaults to 1.
          per_customer_limit: customerLimit,
          starts_at: starts_at || null,
          expires_at: expires_at || null,
          is_active: is_active ?? true,
        })
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { id, ...patch } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "id required" });
      const allowed: Record<string, unknown> = {};
      for (const k of ["code", "percent_off", "min_subtotal", "max_uses", "starts_at", "expires_at", "is_active", "per_customer_limit"]) {
        if (patch[k] !== undefined) allowed[k] = k === "code" ? String(patch[k]).toUpperCase().trim() : patch[k];
      }
      if (allowed.code !== undefined && !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(String(allowed.code))) return res.status(400).json({ error: "Invalid promo code" });
      if (allowed.percent_off !== undefined) {
        const value = Number(allowed.percent_off);
        if (!Number.isFinite(value) || value < 1 || value > 100) return res.status(400).json({ error: "percent_off must be from 1 to 100" });
        allowed.percent_off = value;
      }
      if (allowed.min_subtotal !== undefined) {
        const value = Number(allowed.min_subtotal);
        if (!Number.isFinite(value) || value < 0 || round2(value) !== value)
          return res.status(400).json({
            error: "min_subtotal must be a non-negative dollar amount",
          });
        allowed.min_subtotal = value;
      }
      if (allowed.max_uses !== undefined) {
        const value = allowed.max_uses == null || allowed.max_uses === "" ? null : Number(allowed.max_uses);
        if (value != null && (!Number.isSafeInteger(value) || value < 1))
          return res.status(400).json({
            error: "max_uses must be a positive whole number or blank",
          });
        allowed.max_uses = value;
      }
      if (allowed.per_customer_limit !== undefined) {
        const value = Number(allowed.per_customer_limit);
        if (!Number.isSafeInteger(value) || value < 0)
          return res.status(400).json({
            error: "per_customer_limit must be a non-negative whole number",
          });
        allowed.per_customer_limit = value;
      }
      for (const field of ["starts_at", "expires_at"] as const) {
        if (allowed[field] !== undefined && allowed[field] !== null && allowed[field] !== "" && !Number.isFinite(Date.parse(String(allowed[field])))) return res.status(400).json({ error: `${field} is invalid` });
        if (allowed[field] === "") allowed[field] = null;
      }
      if (allowed.is_active !== undefined && typeof allowed.is_active !== "boolean") return res.status(400).json({ error: "is_active must be boolean" });
      if (Object.keys(allowed).length === 0) return res.status(400).json({ error: "No editable fields in request" });
      const { data, error } = await supabaseAdmin.from("promo_codes").update(allowed).eq("id", id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "id required" });
      // Grab the code first so we can also clear its redemption history: deleting
      // and recreating a code should reset the per-customer usage for everyone
      // (the historical order scan is already bounded by the new promo's
      // created_at; this clears the atomic reservation slots keyed by the code).
      const { data: existing } = await supabaseAdmin.from("promo_codes").select("code").eq("id", id).maybeSingle();
      const { error } = await supabaseAdmin.from("promo_codes").delete().eq("id", id);
      if (error) return res.status(400).json({ error: error.message });
      if (existing?.code) {
        await supabaseAdmin.from("discount_redemptions").delete().eq("code", String(existing.code).toUpperCase());
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/site-promo — the optional store-wide sale ────────────────────
  if (route === "site-promo") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("store_settings").select("*").maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load site settings" });
      return res.json(
        data ?? {
          sitewide_active: false,
          sitewide_percent: null,
          sitewide_label: null,
          sitewide_starts_at: null,
          sitewide_ends_at: null,
        }
      );
    }

    if (req.method === "PUT") {
      const { active, percent, label, starts_at, ends_at } = req.body as {
        active?: boolean;
        percent?: number | string | null;
        label?: string | null;
        starts_at?: string | null;
        ends_at?: string | null;
      };
      const pct = percent != null && percent !== "" ? Number(percent) : null;
      if (pct != null && (!Number.isSafeInteger(pct) || pct < 1 || pct > 99)) {
        return res.status(400).json({
          error: "Enter a percentage between 1 and 99 to enable a site-wide sale.",
        });
      }
      if (active && pct == null)
        return res.status(400).json({
          error: "A percentage is required to enable a site-wide sale.",
        });
      if (label != null && (typeof label !== "string" || label.length > 100)) return res.status(400).json({ error: "Sale label is too long" });
      if ((starts_at && !Number.isFinite(Date.parse(starts_at))) || (ends_at && !Number.isFinite(Date.parse(ends_at))) || (starts_at && ends_at && Date.parse(starts_at) > Date.parse(ends_at))) return res.status(400).json({ error: "Sale dates are invalid" });
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .upsert(
          {
            id: true,
            sitewide_active: !!active,
            sitewide_percent: pct,
            sitewide_label: label || null,
            sitewide_starts_at: starts_at || null,
            sitewide_ends_at: ends_at || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select()
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });

      // Enabling a site-wide sale clears every per-variant sale price so the
      // site-wide promo is the only sale in effect (it always takes precedence).
      if (active) {
        const { data: prods } = await supabaseAdmin.from("products").select("id, variants");
        for (const p of prods ?? []) {
          const variants = ((p.variants as Record<string, unknown>[]) ?? []).map(v => ({
            ...v,
            sale_price: null,
            sale_ends_at: null,
          }));
          await supabaseAdmin.from("products").update({ variants }).eq("id", p.id);
        }
      }
      return res.json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/featured-banner — configurable pill next to the homepage
  // "Featured Products" heading (owner-set text + color) ───────────────────────
  if (route === "featured-banner") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("store_settings").select("featured_banner_active, featured_banner_text, featured_banner_color").maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load banner settings" });
      return res.json(
        data ?? {
          featured_banner_active: false,
          featured_banner_text: null,
          featured_banner_color: null,
        }
      );
    }
    if (req.method === "PUT") {
      const { active, text, color } = req.body as {
        active?: boolean;
        text?: string | null;
        color?: string | null;
      };
      const cleanText = (text ?? "").toString().trim().slice(0, 60) || null;
      const cleanColor = /^#[0-9a-fA-F]{6}$/.test((color ?? "").toString()) ? (color as string) : null;
      if (active && !cleanText) return res.status(400).json({ error: "Enter banner text to turn it on." });
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .upsert(
          {
            id: true,
            featured_banner_active: !!active,
            featured_banner_text: cleanText,
            featured_banner_color: cleanColor,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("featured_banner_active, featured_banner_text, featured_banner_color")
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/rewards — loyalty % + referral amounts ───────────────────────
  if (route === "rewards") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("store_settings").select("loyalty_percent, referral_referee_amount, referral_referrer_amount, referral_min_subtotal").maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load rewards config" });
      return res.json(
        data ?? {
          loyalty_percent: 0,
          referral_referee_amount: 0,
          referral_referrer_amount: 0,
          referral_min_subtotal: 0,
        }
      );
    }
    if (req.method === "PUT") {
      const b = req.body ?? {};
      const loyalty = Number(b.loyalty_percent);
      const referee = Number(b.referral_referee_amount);
      const referrer = Number(b.referral_referrer_amount);
      const minimum = Number(b.referral_min_subtotal);
      if (!Number.isSafeInteger(loyalty) || loyalty < 0 || loyalty > 100)
        return res.status(400).json({
          error: "Loyalty percent must be a whole number from 0 to 100",
        });
      if ([referee, referrer, minimum].some(value => !Number.isFinite(value) || value < 0 || round2(value) !== value))
        return res.status(400).json({
          error: "Reward amounts must be non-negative with at most two decimals",
        });
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .upsert(
          {
            id: true,
            loyalty_percent: loyalty,
            referral_referee_amount: referee,
            referral_referrer_amount: referrer,
            referral_min_subtotal: minimum,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("loyalty_percent, referral_referee_amount, referral_referrer_amount, referral_min_subtotal")
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/quantity-tiers — quantity discount tiers ─────────────────────
  if (route === "quantity-tiers") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("store_settings").select("quantity_tiers").maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load tiers" });
      return res.json({ tiers: (data?.quantity_tiers as unknown[]) ?? [] });
    }
    if (req.method === "PUT") {
      const raw = (req.body?.tiers ?? []) as {
        min_qty?: number | string;
        percent?: number | string;
      }[];
      if (!Array.isArray(raw) || raw.length > 20) return res.status(400).json({ error: "At most 20 quantity tiers are allowed" });
      const tiers = raw.map(t => ({
        min_qty: Number(t.min_qty),
        percent: Number(t.percent),
      }));
      if (tiers.some(tier => !Number.isSafeInteger(tier.min_qty) || tier.min_qty < 1 || !Number.isSafeInteger(tier.percent) || tier.percent < 1 || tier.percent > 100))
        return res.status(400).json({
          error: "Each tier needs positive whole-number quantity and percent values",
        });
      tiers.sort((a, b) => a.min_qty - b.min_qty);
      if (new Set(tiers.map(tier => tier.min_qty)).size !== tiers.length) return res.status(400).json({ error: "Quantity tier minimums must be unique" });
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .upsert(
          {
            id: true,
            quantity_tiers: tiers,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("quantity_tiers")
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ tiers: (data?.quantity_tiers as unknown[]) ?? [] });
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
      const body = req.body ?? {};
      const variants = normalizeVariants(body.variants);
      if (!variants.ok) return res.status(400).json({ error: variants.error });
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(body.slug ?? "")) || String(body.slug).length > 100) return res.status(400).json({ error: "Enter a valid lowercase product slug" });
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200 || typeof body.full_name !== "string" || !body.full_name.trim() || body.full_name.length > 300)
        return res.status(400).json({
          error: "Product name fields are required and must be reasonably sized",
        });
      if (!safeAssetUrl(body.coa_href ?? "")) return res.status(400).json({ error: "Invalid COA URL" });
      const displayOrder = Number(body.display_order ?? 99);
      if (!Number.isSafeInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) return res.status(400).json({ error: "display_order must be a non-negative whole number" });
      const { data, error } = await supabaseAdmin
        .from("products")
        .insert({
          slug: body.slug,
          name: body.name,
          full_name: body.full_name,
          category: body.category,
          tagline: body.tagline,
          description: body.description,
          long_description: body.long_description,
          card_bg: body.card_bg ?? "#f5f5f5",
          badge: body.badge ?? null,
          variants: variants.variants,
          specs: Array.isArray(body.specs) ? body.specs.slice(0, 100) : [],
          storage_instructions: body.storage_instructions ?? "",
          reconstitution_note: body.reconstitution_note ?? null,
          research_notes: Array.isArray(body.research_notes) ? body.research_notes.slice(0, 100) : [],
          coa_href: body.coa_href ?? "",
          is_active: body.is_active ?? true,
          display_order: displayOrder,
        })
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "PATCH") {
      const { id, ...patch } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      // Column allowlist (mirrors the POST insert) — a stray/crafted body key
      // must not write arbitrary columns.
      const PRODUCT_COLS = ["slug", "name", "full_name", "category", "tagline", "description", "long_description", "card_bg", "badge", "variants", "specs", "storage_instructions", "reconstitution_note", "research_notes", "coa_href", "is_active", "display_order"];
      const allowed: Record<string, unknown> = {};
      for (const k of PRODUCT_COLS) if (patch[k] !== undefined) allowed[k] = patch[k];
      if (Object.keys(allowed).length === 0) return res.status(400).json({ error: "No editable fields in request" });
      if (allowed.variants !== undefined) {
        const variants = normalizeVariants(allowed.variants);
        if (!variants.ok) return res.status(400).json({ error: variants.error });
        allowed.variants = variants.variants;
      }
      if (allowed.slug !== undefined && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(allowed.slug)) || String(allowed.slug).length > 100)) return res.status(400).json({ error: "Invalid product slug" });
      if (allowed.coa_href !== undefined && !safeAssetUrl(allowed.coa_href)) return res.status(400).json({ error: "Invalid COA URL" });
      if (allowed.display_order !== undefined) {
        const value = Number(allowed.display_order);
        if (!Number.isSafeInteger(value) || value < 0 || value > 100000)
          return res.status(400).json({
            error: "display_order must be a non-negative whole number",
          });
        allowed.display_order = value;
      }
      const { data, error } = await supabaseAdmin.from("products").update(allowed).eq("id", id).select().single();
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
    // Images only: check both the declared content type and the extension
    // before minting a signed upload URL for the public bucket.
    const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const ext = String(filename)
      .toLowerCase()
      .match(/\.(jpe?g|png|webp|gif)$/)?.[0];
    if (!ext || !IMAGE_TYPES.includes(String(contentType ?? "").toLowerCase())) {
      return res.status(400).json({
        error: "Only image files (jpg, png, webp, gif) can be uploaded",
      });
    }
    const path = `products/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data, error } = await supabaseAdmin.storage.from("product-images").createSignedUploadUrl(path);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ signedUrl: data.signedUrl, path, token: data.token });
  }

  return res.status(404).json({ error: "Not found" });
}
