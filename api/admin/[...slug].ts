import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../_lib/requireAdmin.js";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { sendOrderEvent, sendBackInStock, sendAffiliateCommission, deferEmail, type EmailOrder, type OrderEmailEvent } from "../_lib/email.js";
import { buyLabel, getTrackingStatus, shippoConfigured, shipFromConfigured, shipFromPhoneConfigured } from "../_lib/shippo.js";
import { getRewardConfig, earnLoyalty, grantReferralReward } from "../_lib/credit.js";
import { VT_LOGO_PNG_B64 } from "../_lib/vt-logo.js";
import { formatOrderId } from "../_lib/orderId.js";

// Notify (once) everyone on the back-in-stock waitlist for a cart_code that
// just went from 0 → in stock, then mark those rows notified.
async function notifyWaitlist(cartCode: string) {
  const { data: subs } = await supabaseAdmin
    .from("stock_waitlist")
    .select("id, email")
    .eq("cart_code", cartCode)
    .is("notified_at", null);
  if (!subs || subs.length === 0) return;

  const { data: products } = await supabaseAdmin.from("products").select("name, slug, variants");
  let name = cartCode;
  let slug = "";
  let image: string | undefined;
  for (const p of products ?? []) {
    const v = ((p.variants as { cart_code?: string; dose?: string; image_url?: string }[]) ?? []).find((x) => x.cart_code === cartCode);
    if (v) { name = `${p.name} ${v.dose ?? ""}`.trim(); slug = p.slug as string; image = v.image_url; break; }
  }
  const baseUrl = process.env.BASE_URL || "https://vitumlab.com";
  const url = slug ? `${baseUrl}/shop/${slug}` : `${baseUrl}/shop`;

  for (const s of subs) {
    try { await sendBackInStock(s.email as string, { name, url, image }); }
    catch (err) { console.error(`back-in-stock email failed for ${s.email}:`, err); }
  }
  await supabaseAdmin
    .from("stock_waitlist")
    .update({ notified_at: new Date().toISOString() })
    .eq("cart_code", cartCode)
    .is("notified_at", null);
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
      id: string; email: string; tracking_number: string | null; carrier: string | null;
      fulfillment_status: string | null; shipped_at: string | null; delivered_at: string | null;
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
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return res.status(500).json({ error: "Failed to fetch users" });

    // Per-customer order count + lifetime spend (paid orders, matched by email).
    const spend: Record<string, { orders: number; spent: number }> = {};
    for (let from = 0; ; from += 1000) {
      const { data: batch } = await supabaseAdmin
        .from("orders")
        .select("email, net_amount")
        .in("status", ["confirmed", "finished"])
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

    const users = (data.users ?? []).map((u) => {
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

    type OrderItem = { name: string; dose: string; quantity: number; cartCode: string; price: number };
    type SummaryOrder = {
      status: string; fulfillment_status: string | null; net_amount: number | string;
      items: OrderItem[] | null; created_at: string;
      email: string | null; affiliate_id: string | null;
      commission_amount: number | string | null; cancel_reason: string | null;
    };

    // Page through ALL orders — PostgREST caps a single response at 1000 rows, so a
    // plain select would silently under-count revenue/commission/repeat-rate/top
    // sellers once the store passes 1000 orders. Newest-first ordering is preserved.
    // (If orders ever reach the tens of thousands, move these aggregates into SQL.)
    const ORDER_COLS =
      "status, fulfillment_status, net_amount, items, created_at, email, affiliate_id, commission_amount, cancel_reason";
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
      const [orderRows, invRes, affRes, payRes] = await Promise.all([
        fetchAllOrders(),
        supabaseAdmin.from("inventory").select("cart_code, stock"),
        supabaseAdmin.from("affiliates").select("id, code, name"),
        supabaseAdmin.from("affiliate_payouts").select("affiliate_id, amount"),
      ]);
      rows = orderRows;
      inventory = invRes.data;
      affiliates = affRes.data;
      payouts = payRes.data;
    } catch {
      return res.status(500).json({ error: "Failed to load summary data" });
    }

    const isPaid = (s: string) => s === "confirmed" || s === "finished";
    const num = (v: number | string) => Number(v) || 0;

    const paid = rows.filter((o) => isPaid(o.status));
    const revenueAll = paid.reduce((sum, o) => sum + num(o.net_amount), 0);
    const since30 = since(30);
    const since7 = since(7);
    const revenue30 = paid.filter((o) => o.created_at >= since30).reduce((sum, o) => sum + num(o.net_amount), 0);

    const ordersToFulfill = paid.filter((o) => (o.fulfillment_status ?? "unfulfilled") === "unfulfilled").length;
    const pendingPayment = rows.filter((o) => o.status === "pending").length;
    const ordersThisWeek = rows.filter((o) => o.created_at >= since7).length;
    const aov = paid.length > 0 ? revenueAll / paid.length : 0;

    // Top sellers by quantity (from paid order line items)
    const productTally: Record<string, { name: string; dose: string; qty: number; revenue: number }> = {};
    for (const o of paid) {
      for (const it of o.items ?? []) {
        if (it.cartCode === "bac-water-free") continue;
        const key = it.cartCode || `${it.name} ${it.dose}`;
        if (!productTally[key]) productTally[key] = { name: it.name, dose: it.dose, qty: 0, revenue: 0 };
        productTally[key].qty += it.quantity;
        productTally[key].revenue += (it.price || 0) * it.quantity;
      }
    }
    const topProducts = Object.values(productTally).sort((a, b) => b.qty - a.qty).slice(0, 5);

    const lowStock = (inventory ?? [])
      .filter((r) => r.stock <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.stock - b.stock)
      .map((r) => ({ cartCode: r.cart_code, stock: r.stock }));
    const outOfStockCount = (inventory ?? []).filter((r) => r.stock === 0).length;

    const recentOrders = rows.slice(0, 5).map((o) => ({
      status: o.status,
      fulfillment_status: o.fulfillment_status,
      net_amount: num(o.net_amount),
      created_at: o.created_at,
    }));

    // ── Daily revenue, last 90 ET days (client slices to 10/30/60/90) ───────────
    const etDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
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
    const dailyRevenue = dayKeys.map((d) => ({ date: d, revenue: Math.round((revByDay[d] ?? 0) * 100) / 100 }));

    // ── Affiliate commissions owed = earned (paid orders) − recorded payouts ─────
    const affList = (affiliates ?? []) as { id: string; code: string | null; name: string | null }[];
    const affById = new Map(affList.map((a) => [a.id, a]));
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
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const commissionsByAffiliate = [...new Set([...Object.keys(commTally), ...Object.keys(paidOutTally)])]
      .map((id) => {
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
    const repeatCustomers = Object.values(emailCounts).filter((n) => n > 1).length;
    const totalCustomers = seenEmail.size;
    const repeatCustomerRate = paidAsc.length > 0 ? repeatOrders / paidAsc.length : 0;

    // ── Cancelled / abandoned in the last 30 days (auto-expired is a subset) ─────
    const cancelled30rows = rows.filter((o) => o.status === "cancelled" && o.created_at >= since30);
    const cancelled30 = cancelled30rows.length;
    const autoExpired30 = cancelled30rows.filter((o) =>
      (o.cancel_reason ?? "").toLowerCase().startsWith("auto-expired"),
    ).length;

    // ── Net profit = merchandise net (already discount-adjusted) − affiliate
    // commission. Excludes shipping and product cost (COGS), neither of which
    // is tracked in the system. ──
    const commissionAll = paid.reduce((s, o) => s + num(o.commission_amount), 0);
    const commission30 = paid.filter((o) => o.created_at >= since30).reduce((s, o) => s + num(o.commission_amount), 0);
    const netProfitAll = round2(revenueAll - commissionAll);
    const netProfit30 = round2(revenue30 - commission30);

    return res.json({
      revenue30, revenueAll, paidOrders: paid.length, aov,
      netProfitAll, netProfit30,
      ordersToFulfill, pendingPayment, ordersThisWeek,
      lowStock, outOfStockCount, lowStockThreshold: LOW_STOCK_THRESHOLD,
      topProducts, recentOrders,
      dailyRevenue,
      commissionsOwed, commissionsByAffiliate,
      repeatCustomerRate, repeatCustomers, totalCustomers,
      cancelled30, autoExpired30,
    });
  }

  // ── /api/admin/inventory ──────────────────────────────────────────────────
  // ── /api/admin/waitlist — pending back-in-stock counts per cart_code ───────
  if (route === "waitlist") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const { data, error } = await supabaseAdmin
      .from("stock_waitlist")
      .select("cart_code")
      .is("notified_at", null);
    if (error) return res.status(500).json({ error: "Failed to fetch waitlist" });
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.cart_code as string] = (counts[r.cart_code as string] ?? 0) + 1;
    return res.json({ counts });
  }

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

      // Read prior stock so we can detect a 0 → in-stock restock (waitlist trigger).
      let priorStock: number | null = null;
      if (typeof stock === "number") {
        const { data: prior } = await supabaseAdmin.from("inventory").select("stock").eq("cart_code", cartCode).maybeSingle();
        priorStock = prior?.stock ?? null;
      }

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof stock === "number") {
        if (stock < 0) return res.status(400).json({ error: "stock cannot be negative" });
        update.stock = stock;
      }
      if (typeof isActive === "boolean") update.is_active = isActive;
      const { data, error } = await supabaseAdmin
        .from("inventory").update(update).eq("cart_code", cartCode).select().maybeSingle();
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
    const orderSelect =
      "id, email, items, gross_amount, discount_amount, net_amount, shipping_amount, discount_code, discount_breakdown, credit_applied, referral_code, affiliate_id, commission_amount, status, fulfillment_status, tracking_number, carrier, label_url, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, shipping_address, created_at, confirmed_at, emails_sent";

    // Sends an order email and reloads emails_sent so the response reflects the
    // new stamp. Email failures never fail the admin action.
    const emailAndRefresh = async <T extends { id: string; emails_sent?: Record<string, string> | null }>(
      order: T,
      event: OrderEmailEvent,
      opts?: { force?: boolean; wasPending?: boolean },
    ): Promise<T> => {
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
        action?: "cancel" | "ship" | "buy_label" | "deliver" | "recheck" | "notes" | "resend_email";
        reason?: string;
        tracking_number?: string;
        carrier?: string;
        admin_notes?: string;
        event?: string;
      };
      const { id, action } = body;
      if (!id || !action) return res.status(400).json({ error: "id and action are required" });

      const { data: order, error: fetchErr } = await supabaseAdmin
        .from("orders")
        .select(orderSelect)
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
        const wasPending = order.status === "pending";
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
        return res.json(await emailAndRefresh(data, "cancelled", { wasPending }));
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
        return res.json(await emailAndRefresh(data, "shipped"));
      }

      if (action === "buy_label") {
        if (!PAID.includes(order.status)) return res.status(400).json({ error: "Order must be paid before buying a label" });
        if (!shippoConfigured()) return res.status(400).json({ error: "SHIPPO_API_KEY is not set in the environment" });
        if (!shipFromConfigured()) return res.status(400).json({ error: "Set the ship-from address env vars (SHIP_FROM_STREET1/CITY/STATE/ZIP) before buying labels" });
        if (!shipFromPhoneConfigured()) return res.status(400).json({ error: "USPS requires a sender phone — add SHIP_FROM_PHONE in Vercel (any number you can be reached at). The sender email is auto-filled from your store email." });
        let label;
        try {
          label = await buyLabel(order as { email: string; shipping_address?: Record<string, string> | null });
        } catch (err) {
          console.error("buy_label failed:", err);
          return res.status(502).json({ error: err instanceof Error ? err.message : "Shippo label purchase failed" });
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
          .select(orderSelect)
          .single();
        if (error) return res.status(500).json({ error: "Label purchased but failed to save to the order" });
        return res.json(await emailAndRefresh(data, "shipped"));
      }

      if (action === "deliver") {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({ fulfillment_status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", id)
          .select(orderSelect)
          .single();
        if (error) return res.status(500).json({ error: "Failed to mark delivered" });
        await emailAndRefresh(data, "delivered");
        return res.json(await emailAndRefresh(data, "admin_delivered"));
      }

      if (action === "resend_email") {
        const allowed: OrderEmailEvent[] = ["order_created", "confirmed", "shipped", "delivered", "cancelled", "failed", "admin_new_order", "admin_delivered", "followup"];
        const event = body.event as OrderEmailEvent;
        if (!allowed.includes(event)) return res.status(400).json({ error: "Unknown email event" });
        const refreshed = await emailAndRefresh({ ...order }, event, { force: true });
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
          if (data.discount_code) {
            await supabaseAdmin.rpc("increment_promo_use", { p_code: data.discount_code }).then(() => {}, () => {});
          }
          await emailAndRefresh(data, "confirmed");
          await emailAndRefresh(data, "admin_new_order");
          // Loyalty earn + referral reward (idempotent via the ledger).
          try {
            const cfg = await getRewardConfig();
            await earnLoyalty(data, cfg.loyaltyPercent);
            await grantReferralReward(data, cfg.referrerAmount);
          } catch (err) { console.error("rewards (recheck) failed:", err); }
          // Notify the attributed affiliate of their commission (idempotent).
          if (data.affiliate_id && Number(data.commission_amount) > 0) {
            try {
              const { data: aff } = await supabaseAdmin.from("affiliates").select("email, code").eq("id", data.affiliate_id).maybeSingle();
              if (aff?.email) await sendAffiliateCommission(data as EmailOrder, { email: aff.email, code: aff.code, commission: Number(data.commission_amount) });
            } catch (err) { console.error("affiliate commission email failed:", err); }
          }
          return res.json({ ...data, recheck: "confirmed" });
        }

        if (isFailed && order.status === "pending") {
          const { data } = await supabaseAdmin
            .from("orders").update({ status: "failed" }).eq("id", id).select(orderSelect).single();
          if (data) await emailAndRefresh(data, "failed");
          return res.json({ ...data, recheck: "failed" });
        }

        return res.json({ ...order, recheck: statuses.join(",") || "unchanged" });
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    // Permanently delete one or more orders (hard delete). Does NOT restock —
    // use the Cancel action to restock a paid order. Bulk: pass { ids: [...] }.
    if (req.method === "DELETE") {
      const body = req.body as { id?: string; ids?: string[] };
      const ids = (body.ids?.length ? body.ids : body.id ? [body.id] : []).filter(Boolean);
      if (ids.length === 0) return res.status(400).json({ error: "id or ids required" });
      const { error } = await supabaseAdmin.from("orders").delete().in("id", ids);
      if (error) return res.status(500).json({ error: "Failed to delete orders" });
      return res.json({ ok: true, deleted: ids.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/order-pdfs — combined 4×6 labels OR packing slips (bulk) ─────
  if (route === "order-pdfs") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { ids, type } = req.body as { ids?: string[]; type?: "labels" | "slips" };
    if (!ids?.length) return res.status(400).json({ error: "No orders selected" });
    if (type !== "labels" && type !== "slips") return res.status(400).json({ error: "Invalid PDF type" });

    const { data: rows } = await supabaseAdmin
      .from("orders")
      .select("id, email, items, net_amount, shipping_amount, shipping_address, label_url, tracking_number, carrier, created_at")
      .in("id", ids.slice(0, 100));
    const orders = ids.map((id) => (rows ?? []).find((r) => r.id === id)).filter(Boolean) as Array<{
      id: string; items: { name: string; dose: string; quantity: number; cartCode?: string }[] | null;
      net_amount: number | string; shipping_amount: number | string | null; shipping_address: Record<string, string> | null;
      label_url: string | null; tracking_number: string | null; carrier: string | null; created_at: string;
    }>;
    if (orders.length === 0) return res.status(404).json({ error: "Orders not found" });

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

    if (type === "labels") {
      const merged = await PDFDocument.create();
      let included = 0;
      const skipped: string[] = [];
      for (const o of orders) {
        if (!o.label_url) { skipped.push(o.id.slice(0, 8)); continue; }
        try {
          const buf = await fetch(o.label_url).then((r) => r.arrayBuffer());
          const src = await PDFDocument.load(buf);
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
          included++;
        } catch { skipped.push(o.id.slice(0, 8)); }
      }
      if (included === 0) return res.status(400).json({ error: "None of the selected orders have a label yet — buy labels first." });
      const bytes = await merged.save();
      return res.json({ pdf: Buffer.from(bytes).toString("base64"), included, skipped });
    }

    // Packing slips — clean black-on-white 4×6 slips (thermal-printer friendly).
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const money = (n: number | string | null) => `$${(Number(n) || 0).toFixed(2)}`;
    const logo = await doc.embedPng(Buffer.from(VT_LOGO_PNG_B64, "base64"));

    const PW = 288, PH = 432, M = 20; // 4×6 inches in points
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
        if (cur && bold.widthOfTextAtSize(test, size) > maxW) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    };

    const initPage = (pg: ReturnType<typeof doc.addPage>) => {
      const logoY = PH - M - LOGO_H;
      pg.drawImage(logo, { x: M, y: logoY, width: LOGO_W, height: LOGO_H });
      pg.drawText("Vitum Lab", { x: M + LOGO_W + 9, y: logoY + LOGO_H / 2 - 6, size: 16, font: bold, color: black });
      pg.drawText("PACKING SLIP", { x: M, y: logoY - 17, size: 10, font: bold, color: black });
      pg.drawLine({ start: { x: M, y: logoY - 25 }, end: { x: PW - M, y: logoY - 25 }, thickness: 1, color: black });
      pg.drawText("FOR RESEARCH USE ONLY", { x: M, y: 21, size: 8, font: bold, color: black });
      pg.drawText("vitumlab.com", { x: M, y: 11, size: 8, font: bold, color: black });
    };

    for (const o of orders) {
      let page = doc.addPage([PW, PH]);
      initPage(page);
      let y = CONTENT_TOP;

      const need = (h: number) => { if (y - h < FOOT) { page = doc.addPage([PW, PH]); initPage(page); y = CONTENT_TOP; } };
      const text = (s: string, size: number, x = M) => { need(size); page.drawText(clean(s), { x, y, size, font: bold, color: black }); y -= size + 4; };
      const hr = () => { need(7); page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PW - M, y: y + 4 }, thickness: 0.8, color: black }); y -= 8; };

      // Order meta
      text(`Order ${formatOrderId(o.id)}`, 11);
      text(`Date: ${new Date(o.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`, 9);
      if (o.tracking_number) for (const w of wrap(`Tracking: ${o.carrier || "USPS"} ${o.tracking_number}`, 9, PW - 2 * M)) text(w, 9);
      hr();

      // Ship to
      text("SHIP TO", 9);
      const a = o.shipping_address || {};
      const addrLines = [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : ""), a.country]
        .filter((l) => l && String(l).trim());
      for (const l of addrLines) for (const w of wrap(String(l), 10, PW - 2 * M)) text(w, 10);
      hr();

      // Items (qty + wrapped name)
      text("ITEMS", 9);
      const nameX = M + 24;
      for (const it of o.items ?? []) {
        const isFree = it.cartCode === "bac-water-free";
        const lines = wrap(`${it.name} ${it.dose}${isFree ? " (free gift)" : ""}`, 10, PW - M - nameX);
        need(10);
        page.drawText(`${it.quantity}x`, { x: M, y, size: 10, font: bold, color: black });
        lines.forEach((ln, i) => {
          if (i > 0) need(10);
          page.drawText(ln, { x: nameX, y, size: 10, font: bold, color: black });
          y -= 10 + (i === lines.length - 1 ? 6 : 2);
        });
      }
      hr();

      // Total
      need(15);
      page.drawText("TOTAL", { x: M, y, size: 13, font: bold, color: black });
      const tot = money((Number(o.net_amount) || 0) + (Number(o.shipping_amount) || 0));
      page.drawText(tot, { x: PW - M - bold.widthOfTextAtSize(tot, 13), y, size: 13, font: bold, color: black });
      y -= 18;
    }
    const bytes = await doc.save();
    return res.json({ pdf: Buffer.from(bytes).toString("base64") });
  }

  // ── /api/admin/affiliates ────────────────────────────────────────────────
  if (route === "affiliates") {
    if (req.method === "GET") {
      const [{ data: affs, error }, { data: payouts }] = await Promise.all([
        supabaseAdmin.from("affiliates").select("id, email, code, name, discount_percent, commission_percent, created_at").order("created_at"),
        supabaseAdmin.from("affiliate_payouts").select("id, affiliate_id, amount, note, created_at").order("created_at", { ascending: false }),
      ]);
      if (error) return res.status(500).json({ error: "Failed to fetch affiliates" });

      // Earned = commission on paid orders, paged past the 1000-row cap.
      const earnedTally: Record<string, { earned: number; orders: number }> = {};
      for (let from = 0; ; from += 1000) {
        const { data: batch } = await supabaseAdmin
          .from("orders")
          .select("affiliate_id, commission_amount")
          .in("status", ["confirmed", "finished"])
          .not("affiliate_id", "is", null)
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
      const result = (affs ?? []).map((a) => {
        const rows = (payouts ?? []).filter((p) => p.affiliate_id === a.id);
        const paidOut = rows.reduce((s, p) => s + (Number(p.amount) || 0), 0);
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

    if (req.method === "POST") {
      const { email, code, name, discount_percent, commission_percent } = req.body ?? {};
      if (!email || !code) return res.status(400).json({ error: "email and code are required" });
      const { data, error } = await supabaseAdmin
        .from("affiliates")
        .insert({
          email: String(email).toLowerCase().trim(),
          code: String(code).toUpperCase().trim(),
          name: name || null,
          discount_percent: Number(discount_percent) || 0,
          commission_percent: Number(commission_percent) || 0,
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
        if (patch[k] !== undefined) allowed[k] = k === "code" ? String(patch[k]).toUpperCase().trim() : patch[k];
      }
      const { data, error } = await supabaseAdmin.from("affiliates").update(allowed).eq("id", id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/payouts ───────────────────────────────────────────────────
  if (route === "payouts") {
    if (req.method === "POST") {
      const { affiliateId, amount, note } = req.body ?? {};
      const amt = Number(amount);
      if (!affiliateId || !(amt > 0)) return res.status(400).json({ error: "affiliateId and a positive amount are required" });
      const { data, error } = await supabaseAdmin
        .from("affiliate_payouts")
        .insert({ affiliate_id: affiliateId, amount: amt, note: note || null })
        .select()
        .single();
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
      const { data, error } = await supabaseAdmin
        .from("promo_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: "Failed to fetch promo codes" });
      return res.json(data);
    }

    if (req.method === "POST") {
      const { code, percent_off, min_subtotal, max_uses, starts_at, expires_at, is_active } = req.body ?? {};
      const pct = Number(percent_off);
      if (!code || !(pct >= 1 && pct <= 100)) return res.status(400).json({ error: "code and percent_off (1-100) are required" });
      const { data, error } = await supabaseAdmin
        .from("promo_codes")
        .insert({
          code: String(code).toUpperCase().trim(),
          percent_off: pct,
          min_subtotal: Number(min_subtotal) || 0,
          max_uses: max_uses != null && max_uses !== "" ? Number(max_uses) : null,
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
      for (const k of ["code", "percent_off", "min_subtotal", "max_uses", "starts_at", "expires_at", "is_active"]) {
        if (patch[k] !== undefined) allowed[k] = k === "code" ? String(patch[k]).toUpperCase().trim() : patch[k];
      }
      const { data, error } = await supabaseAdmin.from("promo_codes").update(allowed).eq("id", id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === "DELETE") {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "id required" });
      const { error } = await supabaseAdmin.from("promo_codes").delete().eq("id", id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── /api/admin/site-promo — the optional store-wide sale ────────────────────
  if (route === "site-promo") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.from("store_settings").select("*").maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load site settings" });
      return res.json(data ?? { sitewide_active: false, sitewide_percent: null, sitewide_label: null, sitewide_starts_at: null, sitewide_ends_at: null });
    }

    if (req.method === "PUT") {
      const { active, percent, label, starts_at, ends_at } = req.body as {
        active?: boolean; percent?: number | string | null; label?: string | null; starts_at?: string | null; ends_at?: string | null;
      };
      const pct = percent != null && percent !== "" ? Number(percent) : null;
      if (active && !(pct != null && pct >= 1 && pct <= 99)) {
        return res.status(400).json({ error: "Enter a percentage between 1 and 99 to enable a site-wide sale." });
      }
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
          { onConflict: "id" },
        )
        .select()
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });

      // Enabling a site-wide sale clears every per-variant sale price so the
      // site-wide promo is the only sale in effect (it always takes precedence).
      if (active) {
        const { data: prods } = await supabaseAdmin.from("products").select("id, variants");
        for (const p of prods ?? []) {
          const variants = (((p.variants as Record<string, unknown>[]) ?? [])).map((v) => ({
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

  // ── /api/admin/rewards — loyalty % + referral amounts ───────────────────────
  if (route === "rewards") {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .select("loyalty_percent, referral_referee_amount, referral_referrer_amount, referral_min_subtotal")
        .maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load rewards config" });
      return res.json(data ?? { loyalty_percent: 0, referral_referee_amount: 0, referral_referrer_amount: 0, referral_min_subtotal: 0 });
    }
    if (req.method === "PUT") {
      const b = req.body ?? {};
      const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .upsert(
          {
            id: true,
            loyalty_percent: Math.min(100, Math.round(num(b.loyalty_percent))),
            referral_referee_amount: num(b.referral_referee_amount),
            referral_referrer_amount: num(b.referral_referrer_amount),
            referral_min_subtotal: num(b.referral_min_subtotal),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
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
      const raw = ((req.body?.tiers ?? []) as { min_qty?: number | string; percent?: number | string }[]);
      const tiers = raw
        .map((t) => ({ min_qty: Math.floor(Number(t.min_qty) || 0), percent: Math.round(Number(t.percent) || 0) }))
        .filter((t) => t.min_qty >= 1 && t.percent >= 1 && t.percent <= 100)
        .sort((a, b) => a.min_qty - b.min_qty);
      const { data, error } = await supabaseAdmin
        .from("store_settings")
        .upsert({ id: true, quantity_tiers: tiers, updated_at: new Date().toISOString() }, { onConflict: "id" })
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
