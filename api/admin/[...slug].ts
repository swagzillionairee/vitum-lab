import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../_lib/requireAdmin.js";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { sendOrderEvent, type EmailOrder, type OrderEmailEvent } from "../_lib/email.js";

// Handles all /api/admin/* routes: inventory, orders, products, upload
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  // Parse route from URL — more reliable than req.query.slug with rewrites
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/admin\/?/, "").split("/")[0];

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

    return res.json({
      revenue30, revenueAll, paidOrders: paid.length, aov,
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
      "id, email, items, gross_amount, discount_amount, net_amount, discount_code, affiliate_id, commission_amount, status, fulfillment_status, tracking_number, carrier, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, shipping_address, created_at, confirmed_at, emails_sent";

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
        action?: "cancel" | "ship" | "deliver" | "recheck" | "notes" | "resend_email";
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

      if (action === "deliver") {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .update({ fulfillment_status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", id)
          .select(orderSelect)
          .single();
        if (error) return res.status(500).json({ error: "Failed to mark delivered" });
        return res.json(await emailAndRefresh(data, "delivered"));
      }

      if (action === "resend_email") {
        const allowed: OrderEmailEvent[] = ["order_created", "confirmed", "shipped", "delivered", "cancelled", "failed", "admin_new_order"];
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

    return res.status(405).json({ error: "Method not allowed" });
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
      const { code, percent_off, min_subtotal, max_uses, expires_at, is_active } = req.body ?? {};
      const pct = Number(percent_off);
      if (!code || !(pct >= 1 && pct <= 100)) return res.status(400).json({ error: "code and percent_off (1-100) are required" });
      const { data, error } = await supabaseAdmin
        .from("promo_codes")
        .insert({
          code: String(code).toUpperCase().trim(),
          percent_off: pct,
          min_subtotal: Number(min_subtotal) || 0,
          max_uses: max_uses != null && max_uses !== "" ? Number(max_uses) : null,
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
      for (const k of ["code", "percent_off", "min_subtotal", "max_uses", "expires_at", "is_active"]) {
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
