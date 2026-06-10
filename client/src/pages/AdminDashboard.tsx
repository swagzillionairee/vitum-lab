/*
 * AdminDashboard.tsx — Vitum Lab owner-only dashboard (orchestrator).
 * Tabs: Overview | Products | Inventory | Orders | Shipping | Affiliates | Promos | Customers
 * Overview/Products/Inventory/Orders are rendered inline (they share the
 * loadData-fetched state + order filter state); the self-contained tabs live
 * in ./admin/*Tab.tsx. Shared types/helpers/components are in ./admin/.
 */

import { useEffect, useState, useCallback, Fragment } from "react";
import { useLocation } from "wouter";
import {
  Package, ClipboardList, LogOut, Loader2, Check, Plus,
  Pencil, Trash2, Upload, ShoppingBag, ImageOff,
  Truck, RefreshCw, Ban, CheckCircle2, ChevronDown,
  LayoutDashboard, DollarSign, Clock, AlertTriangle, TrendingUp,
  Wallet, Repeat, XCircle, Users, Mail, Tag, UserRound, FileDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import { invalidateProductsCache } from "@/hooks/useProducts";
import OrderTimeline from "@/components/OrderTimeline";
import SEO from "@/components/SEO";
import type { ProductRow, InventoryRow, OrderRow, Summary } from "./admin/types";
import { money, formatDateEST, payLabel, addressLines, STATUS_COLORS, FULFILLMENT_COLORS, Kpi, RevenueChart } from "./admin/shared";
import { ProductModal } from "./admin/ProductModal";
import AffiliatesTab from "./admin/AffiliatesTab";
import PromosTab from "./admin/PromosTab";
import CustomersTab from "./admin/CustomersTab";
import ShippingTab from "./admin/ShippingTab";

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { session, loading, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"overview" | "products" | "inventory" | "orders" | "shipping" | "affiliates" | "promos" | "customers">("overview");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Products
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editProduct, setEditProduct] = useState<ProductRow | null | "new">(null);

  // Inventory
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [waitlistCounts, setWaitlistCounts] = useState<Record<string, number>>({});

  // Overview summary
  const [summary, setSummary] = useState<Summary | null>(null);

  // Orders
  const ORDERS_PER_PAGE = 25;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderBusy, setOrderBusy] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderFulfillment, setOrderFulfillment] = useState("");
  const [copiedOrder, setCopiedOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/admin/login");
  }, [loading, session, navigate]);

  const orderQueryString = useCallback((overrides?: Record<string, string>) => {
    const params = new URLSearchParams({ page: String(orderPage), perPage: String(ORDERS_PER_PAGE) });
    if (orderSearch.trim()) params.set("search", orderSearch.trim());
    if (orderStatus) params.set("status", orderStatus);
    if (orderFulfillment) params.set("fulfillment", orderFulfillment);
    for (const [k, v] of Object.entries(overrides ?? {})) params.set(k, v);
    return params.toString();
  }, [orderPage, orderSearch, orderStatus, orderFulfillment]);

  const loadOrders = useCallback(async () => {
    if (!session) return;
    const res = await authedFetch(`/api/admin/orders?${orderQueryString()}`);
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders ?? []);
      setOrderTotal(data.total ?? 0);
    }
  }, [session, orderQueryString]);

  // Reload orders (debounced) when page/filters/search change.
  useEffect(() => {
    const t = setTimeout(loadOrders, 250);
    return () => clearTimeout(t);
  }, [loadOrders]);

  const exportOrdersCsv = async () => {
    const res = await authedFetch(`/api/admin/orders?${orderQueryString({ page: "1", perPage: "2000" })}`);
    if (!res.ok) { alert("Export failed"); return; }
    const { orders: rows } = (await res.json()) as { orders: OrderRow[] };
    const header = ["Order ID", "Email", "Payment", "Fulfillment", "Gross", "Discount", "Net", "Pay Currency", "Name", "Address", "City", "State", "ZIP", "Country", "Phone", "Tracking", "Created (ET)"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")];
    for (const o of rows) {
      const a = o.shipping_address ?? {};
      lines.push([
        o.id, o.email, o.status, o.fulfillment_status ?? "", o.gross_amount ?? "", o.discount_amount ?? "", o.net_amount,
        o.pay_currency ?? "", a.name ?? "", [a.line1, a.line2].filter(Boolean).join(" "), a.city ?? "", a.state ?? "",
        a.postal_code ?? "", a.country ?? "", a.phone ?? "", o.tracking_number ?? "", formatDateEST(o.created_at),
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vitumlab-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyAddress = (o: OrderRow) => {
    const lines = addressLines(o.shipping_address);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedOrder(o.id);
    setTimeout(() => setCopiedOrder((c) => (c === o.id ? null : c)), 1500);
  };

  const orderAction = async (id: string, action: string, extra?: Record<string, unknown>) => {
    setOrderBusy(id);
    try {
      const res = await authedFetch("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ id, action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...data } : o)));
        if (action === "recheck") {
          alert(data.recheck === "confirmed" ? "Payment found — order confirmed." :
            data.recheck === "no_payment_found" ? "No matching payment found on NowPayments." :
            data.recheck === "failed" ? "Payment failed/expired — order marked failed." :
            `NowPayments status: ${data.recheck ?? "unchanged"}`);
        }
      } else {
        alert(data.error ?? "Action failed");
      }
    } finally {
      setOrderBusy(null);
    }
  };

  const handleCancel = (id: string) => {
    const reason = prompt("Cancel this order? Optionally enter a reason:", "Cancelled by admin");
    if (reason === null) return;
    orderAction(id, "cancel", { reason: reason || "Cancelled by admin" });
  };

  const handleShip = (id: string) => {
    const tracking = prompt("Tracking number:");
    if (!tracking?.trim()) return;
    const carrier = prompt("Carrier:", "USPS") || undefined;
    orderAction(id, "ship", { tracking_number: tracking.trim(), carrier });
  };

  // Buy a USPS Priority Mail Flat Rate Padded Envelope label via Shippo,
  // then open the label PDF. On success the order flips to shipped + tracking.
  const handleBuyLabel = async (id: string) => {
    if (!confirm("Buy a USPS Priority Mail Flat Rate Padded Envelope label for this order via Shippo?")) return;
    setOrderBusy(id);
    try {
      const res = await authedFetch("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ id, action: "buy_label" }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...data } : o)));
        if (data.label_url) window.open(data.label_url, "_blank");
      } else {
        alert(data.error ?? "Failed to buy label");
      }
    } finally {
      setOrderBusy(null);
    }
  };

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const invRes = await authedFetch("/api/admin/inventory");
      if (invRes.status === 401) { setAuthorized(false); return; }
      setAuthorized(true);

      if (!invRes.ok) throw new Error(`Inventory API returned ${invRes.status}`);
      setInventory(await invRes.json());

      const [prodRes, sumRes, wlRes] = await Promise.all([
        authedFetch("/api/admin/products"),
        authedFetch("/api/admin/summary"),
        authedFetch("/api/admin/waitlist"),
      ]);
      if (prodRes.ok) {
        setProducts(await prodRes.json());
      } else {
        const err = await prodRes.json().catch(() => ({ error: `HTTP ${prodRes.status}` }));
        setLoadError(`Failed to load products: ${err.error ?? prodRes.status}`);
      }
      if (sumRes.ok) setSummary(await sumRes.json());
      if (wlRes.ok) setWaitlistCounts((await wlRes.json()).counts ?? {});
      // Orders are loaded separately by loadOrders (supports search/filter/pagination).
    } catch (err) {
      if (authorized === null) setAuthorized(false);
      setLoadError(err instanceof Error ? err.message : "Failed to connect to the API. Are you running with the API server?");
    }
  }, [authorized]);

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

  // ── Per-order email log (which transactional emails apply + their send state) ─
  const EMAIL_EVENTS: { event: string; label: string; applies: (o: OrderRow) => boolean }[] = [
    { event: "order_created", label: "Order received", applies: () => true },
    { event: "confirmed", label: "Payment confirmed", applies: (o) => o.status === "confirmed" || o.status === "finished" },
    { event: "admin_new_order", label: "Admin alert", applies: (o) => o.status === "confirmed" || o.status === "finished" },
    { event: "shipped", label: "Shipping confirmation", applies: (o) => !!o.tracking_number || o.fulfillment_status === "shipped" || o.fulfillment_status === "delivered" },
    { event: "delivered", label: "Delivered", applies: (o) => o.fulfillment_status === "delivered" },
    { event: "admin_delivered", label: "Delivered alert (you)", applies: (o) => o.fulfillment_status === "delivered" },
    { event: "followup", label: "Post-delivery follow-up", applies: (o) => o.fulfillment_status === "delivered" },
    { event: "cancelled", label: "Cancelled", applies: (o) => o.status === "cancelled" },
    { event: "failed", label: "Payment failed", applies: (o) => o.status === "failed" },
  ];

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
    { key: "overview" as const, label: "Overview", icon: LayoutDashboard },
    { key: "products" as const, label: "Products", icon: ShoppingBag },
    { key: "inventory" as const, label: "Inventory", icon: Package },
    { key: "orders" as const, label: "Orders", icon: ClipboardList },
    { key: "shipping" as const, label: "Shipping", icon: Truck },
    { key: "affiliates" as const, label: "Affiliates", icon: Users },
    { key: "promos" as const, label: "Promos", icon: Tag },
    { key: "customers" as const, label: "Customers", icon: UserRound },
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
        <div className="flex gap-1 mb-8 flex-wrap">
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

        {/* ── Load error banner ─────────────────────────────────────────── */}
        {loadError && (
          <div className="mb-6 bg-[oklch(0.96_0.02_25)] border border-[oklch(0.88_0.05_25)] rounded-xl px-5 py-3 text-[0.875rem] text-[oklch(0.45_0.18_25)]">
            {loadError}
          </div>
        )}

        {/* ── Overview tab ──────────────────────────────────────────────── */}
        {tab === "overview" && (
          !summary ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Primary KPIs (color-coded by status) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi icon={DollarSign} label="Revenue (30d)" value={money(summary.revenue30)}
                  tone={summary.revenue30 > 0 ? "good" : "neutral"}>
                  {money(summary.revenueAll)} all-time
                </Kpi>
                <Kpi icon={Truck} label="To Fulfill" value={summary.ordersToFulfill}
                  tone={summary.ordersToFulfill > 0 ? "warn" : "good"}>
                  <button onClick={() => { setOrderStatus(""); setOrderFulfillment("unfulfilled"); setOrderPage(1); setTab("orders"); }}
                    className="text-[oklch(0.40_0.16_260)] font-semibold hover:underline">Paid &amp; unshipped →</button>
                </Kpi>
                <Kpi icon={Clock} label="Pending Payment" value={summary.pendingPayment}
                  tone={summary.pendingPayment > 0 ? "warn" : "neutral"}>
                  <button onClick={() => { setOrderFulfillment(""); setOrderStatus("pending"); setOrderPage(1); setTab("orders"); }}
                    className="text-[oklch(0.40_0.16_260)] font-semibold hover:underline">Awaiting crypto →</button>
                </Kpi>
                <Kpi icon={AlertTriangle} label="Low Stock" value={summary.lowStock.length}
                  tone={summary.outOfStockCount > 0 ? "urgent" : summary.lowStock.length > 0 ? "warn" : "good"}>
                  {summary.outOfStockCount} out of stock
                </Kpi>
              </div>

              {/* Revenue bar chart (10 / 30 / 60 / 90-day) */}
              <RevenueChart data={summary.dailyRevenue} />

              {/* Business-health KPIs */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Kpi icon={Wallet} label="Commissions Owed" value={money(summary.commissionsOwed ?? 0)}
                  tone={(summary.commissionsOwed ?? 0) > 0 ? "warn" : "neutral"}>
                  {(summary.commissionsByAffiliate ?? []).length} affiliate{(summary.commissionsByAffiliate ?? []).length !== 1 ? "s" : ""} with earnings
                </Kpi>
                <Kpi icon={Repeat} label="Repeat Rate"
                  value={`${((summary.repeatCustomerRate ?? 0) * 100).toFixed(0)}%`}
                  tone={summary.paidOrders === 0 ? "neutral" : (summary.repeatCustomerRate ?? 0) >= 0.25 ? "good" : (summary.repeatCustomerRate ?? 0) > 0 ? "warn" : "neutral"}>
                  {summary.repeatCustomers ?? 0} repeat of {summary.totalCustomers ?? 0} customers
                </Kpi>
                <Kpi icon={XCircle} label="Cancelled (30d)" value={summary.cancelled30 ?? 0}
                  tone={(summary.cancelled30 ?? 0) > 5 ? "urgent" : (summary.cancelled30 ?? 0) > 0 ? "warn" : "good"}>
                  {summary.autoExpired30 ?? 0} auto-expired
                </Kpi>
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Kpi icon={TrendingUp} label="Orders (7d)" value={summary.ordersThisWeek} tone="info" size="md" />
                <Kpi icon={DollarSign} label="Avg Order" value={money(summary.aov)} tone="info" size="md" />
                <Kpi icon={CheckCircle2} label="Paid Orders" value={summary.paidOrders}
                  tone={summary.paidOrders > 0 ? "good" : "neutral"} size="md" />
              </div>

              {/* Affiliate commissions owed — per-affiliate breakdown */}
              <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[oklch(0.45_0.16_260)]" />
                    <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)]">Commissions Owed by Affiliate</h3>
                  </div>
                  <span className="text-[0.9375rem] font-bold text-[oklch(0.42_0.12_85)]">{money(summary.commissionsOwed ?? 0)}</span>
                </div>
                {(summary.commissionsByAffiliate ?? []).length === 0 ? (
                  <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No affiliate commissions owed yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {(summary.commissionsByAffiliate ?? []).map((a) => {
                      const top = Math.max(...(summary.commissionsByAffiliate ?? []).map((x) => x.owed), 1);
                      return (
                        <li key={a.id}>
                          <div className="flex items-center justify-between text-[0.8125rem] mb-1">
                            <span className="text-[oklch(0.20_0.01_260)] font-semibold truncate pr-2">
                              {a.name}
                              {a.code ? <span className="ml-1.5 font-mono text-[0.6875rem] text-[oklch(0.55_0.01_260)]">{a.code}</span> : null}
                            </span>
                            <span className="whitespace-nowrap">
                              <span className="text-[oklch(0.55_0.01_260)] mr-2">{a.orders} order{a.orders !== 1 ? "s" : ""} · earned {money(a.amount)} · paid {money(a.paid ?? 0)}</span>
                              <span className="font-bold text-[oklch(0.13_0.01_260)]">{money(a.owed ?? a.amount)} owed</span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[oklch(0.95_0.003_260)] overflow-hidden">
                            <div className="h-full rounded-full bg-[oklch(0.65_0.12_85)]" style={{ width: `${Math.max(4, (Math.max(a.owed ?? 0, 0) / top) * 100)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Low stock list */}
                <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                  <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] mb-3">Low / Out of Stock</h3>
                  {summary.lowStock.length === 0 ? (
                    <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">All products are above {summary.lowStockThreshold} units.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.lowStock.map((s) => (
                        <li key={s.cartCode} className="flex items-center justify-between text-[0.8125rem]">
                          <span className="font-mono text-[oklch(0.30_0.01_260)]">{s.cartCode}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold ${s.stock === 0 ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]" : "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]"}`}>{s.stock} left</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Top sellers */}
                <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                  <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] mb-3">Top Sellers</h3>
                  {summary.topProducts.length === 0 ? (
                    <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No paid orders yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.topProducts.map((p, i) => (
                        <li key={i} className="flex items-center justify-between text-[0.8125rem]">
                          <span className="text-[oklch(0.30_0.01_260)] truncate pr-2">{p.name} <span className="text-[oklch(0.55_0.01_260)]">{p.dose}</span></span>
                          <span className="font-semibold text-[oklch(0.13_0.01_260)] whitespace-nowrap">{p.qty} · {money(p.revenue)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Recent orders */}
                <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)]">Recent Orders</h3>
                    <button onClick={() => setTab("orders")} className="text-[0.75rem] text-[oklch(0.40_0.16_260)] font-semibold hover:underline">View all</button>
                  </div>
                  {summary.recentOrders.length === 0 ? (
                    <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No orders yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.recentOrders.map((o, i) => (
                        <li key={i} className="flex items-center justify-between text-[0.8125rem]">
                          <span className="text-[oklch(0.52_0.01_260)]">{new Date(o.created_at).toLocaleDateString()}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-[oklch(0.13_0.01_260)]">{money(o.net_amount)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[0.625rem] font-semibold ${STATUS_COLORS[o.status] ?? STATUS_COLORS.pending}`}>{o.status}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )
        )}

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
            <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-4">Edit stock per cart code. Set a product to 0 to mark it out of stock (its Add to Cart button is disabled on the storefront). Changes save automatically on blur.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                    <th className="py-2 pr-4">Cart Code</th>
                    <th className="py-2 pr-4">Stock</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((row) => (
                    <tr key={row.cart_code} className="border-b border-[oklch(0.95_0.003_260)]">
                      <td className="py-3 pr-4 font-mono text-[0.8125rem] text-[oklch(0.20_0.01_260)]">
                        {row.cart_code}
                        {waitlistCounts[row.cart_code] > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.625rem] font-semibold bg-[oklch(0.95_0.04_260)] text-[oklch(0.35_0.15_260)]" title="People waiting for restock">
                            🔔 {waitlistCounts[row.cart_code]} waiting
                          </span>
                        )}
                      </td>
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
                        <span className={`px-3 py-1 rounded-full text-[0.75rem] font-semibold ${
                          row.stock > 0
                            ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                            : "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
                        }`}>
                          {row.stock > 0 ? "In stock" : "Out of stock"}
                        </span>
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
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Orders</h2>
                <span className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">({orderTotal})</span>
              </div>
              <button
                onClick={exportOrdersCsv}
                className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)]"
              >
                <Upload className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <input
                type="text" value={orderSearch}
                onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }}
                placeholder="Search email or order ID…"
                className="flex-1 min-w-[180px] border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
              />
              <select
                value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value); setOrderPage(1); }}
                className="border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
              >
                <option value="">All payments</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="finished">Finished</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={orderFulfillment} onChange={(e) => { setOrderFulfillment(e.target.value); setOrderPage(1); }}
                className="border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
              >
                <option value="">All fulfillment</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>

            {orders.length === 0 ? (
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">
                {orderSearch || orderStatus || orderFulfillment ? "No orders match your filters." : "No orders yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.875rem]">
                  <thead>
                    <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                      <th className="py-2 pr-4">Order</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Items</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Payment</th>
                      <th className="py-2 pr-4">Fulfillment</th>
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const isPaid = o.status === "confirmed" || o.status === "finished";
                      const isClosed = o.status === "cancelled" || o.status === "failed";
                      const fulfillment = o.fulfillment_status ?? "unfulfilled";
                      const busy = orderBusy === o.id;
                      const expanded = expandedOrder === o.id;
                      return (
                        <Fragment key={o.id}>
                          <tr className="border-b border-[oklch(0.95_0.003_260)] align-top">
                            <td className="py-3 pr-4">
                              <button
                                onClick={() => setExpandedOrder(expanded ? null : o.id)}
                                className="flex items-center gap-1 font-mono text-[0.75rem] text-[oklch(0.20_0.01_260)] hover:text-[oklch(0.40_0.16_260)]"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                                {o.id.slice(0, 10)}
                              </button>
                            </td>
                            <td className="py-3 pr-4 text-[oklch(0.40_0.01_260)]">{o.email}</td>
                            <td className="py-3 pr-4">
                              <div className="space-y-0.5 min-w-[150px]">
                                {(o.items ?? []).filter((it) => it.cartCode !== "bac-water-free").map((it, i) => (
                                  <div key={i} className="text-[0.75rem] text-[oklch(0.30_0.01_260)] whitespace-nowrap leading-snug">
                                    <span className="font-bold text-[oklch(0.13_0.01_260)]">{it.quantity}×</span> {it.name}{" "}
                                    <span className="text-[oklch(0.55_0.01_260)]">{it.dose}</span>
                                  </div>
                                ))}
                                {(o.items ?? []).some((it) => it.cartCode === "bac-water-free") && (
                                  <div className="text-[0.6875rem] text-[oklch(0.55_0.01_260)] italic leading-snug">+ free BAC Water</div>
                                )}
                                {(o.items ?? []).filter((it) => it.cartCode !== "bac-water-free").length === 0 &&
                                  !(o.items ?? []).some((it) => it.cartCode === "bac-water-free") && (
                                    <span className="text-[0.75rem] text-[oklch(0.65_0.01_260)]">—</span>
                                  )}
                              </div>
                            </td>
                            <td className="py-3 pr-4 font-semibold text-[oklch(0.13_0.01_260)]">${Number(o.net_amount).toFixed(2)}</td>
                            <td className="py-3 pr-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${STATUS_COLORS[o.status] ?? STATUS_COLORS.pending}`}>
                                {o.status}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              {isPaid ? (
                                <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${FULFILLMENT_COLORS[fulfillment] ?? FULFILLMENT_COLORS.unfulfilled}`}>
                                  {fulfillment}
                                </span>
                              ) : (
                                <span className="text-[0.75rem] text-[oklch(0.65_0.01_260)]">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-[0.8125rem] text-[oklch(0.52_0.01_260)] whitespace-nowrap">{formatDateEST(o.created_at)}</td>
                            <td className="py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[oklch(0.52_0.01_260)]" />}
                                {o.status === "pending" && (
                                  <button onClick={() => orderAction(o.id, "recheck")} disabled={busy} title="Re-check payment on NowPayments"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] border border-[oklch(0.40_0.16_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.02_260)] disabled:opacity-50">
                                    <RefreshCw className="w-3 h-3" /> Re-check
                                  </button>
                                )}
                                {isPaid && fulfillment === "unfulfilled" && (
                                  <>
                                    <button onClick={() => handleBuyLabel(o.id)} disabled={busy} title="Buy USPS label via Shippo"
                                      className="flex items-center gap-1 text-[0.7rem] font-semibold text-white bg-[oklch(0.40_0.16_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.35_0.16_260)] disabled:opacity-50">
                                      <Truck className="w-3 h-3" /> Buy label
                                    </button>
                                    <button onClick={() => handleShip(o.id)} disabled={busy} title="Enter tracking manually"
                                      className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] border border-[oklch(0.40_0.16_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.02_260)] disabled:opacity-50">
                                      Manual
                                    </button>
                                  </>
                                )}
                                {o.label_url && (
                                  <a href={o.label_url} target="_blank" rel="noopener noreferrer" title="Open shipping label PDF"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.40_0.01_260)] border border-[oklch(0.85_0.004_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.003_260)]">
                                    <FileDown className="w-3 h-3" /> Label
                                  </a>
                                )}
                                {isPaid && fulfillment === "shipped" && (
                                  <button onClick={() => orderAction(o.id, "deliver")} disabled={busy} title="Mark delivered"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.35_0.14_155)] border border-[oklch(0.70_0.10_155)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.03_155)] disabled:opacity-50">
                                    <CheckCircle2 className="w-3 h-3" /> Delivered
                                  </button>
                                )}
                                {!isClosed && (
                                  <button onClick={() => handleCancel(o.id)} disabled={busy} title="Cancel order"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50">
                                    <Ban className="w-3 h-3" /> Cancel
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-b border-[oklch(0.95_0.003_260)] bg-[oklch(0.98_0.002_260)]">
                              <td colSpan={8} className="px-4 py-3">
                                {/* Status timeline */}
                                <div className="mb-4 max-w-md">
                                  <OrderTimeline order={o} />
                                </div>
                                <div className="flex flex-wrap gap-8 text-[0.8125rem] text-[oklch(0.35_0.01_260)]">
                                  {/* Order details + items */}
                                  <div className="space-y-1 min-w-[240px]">
                                    <p className="font-mono text-[0.7rem] text-[oklch(0.55_0.01_260)]">{o.id}</p>
                                    <div>
                                      <p className="font-semibold mb-0.5">Items</p>
                                      {(o.items ?? []).length === 0 ? (
                                        <span className="text-[oklch(0.60_0.01_260)]">—</span>
                                      ) : (
                                        <ul className="space-y-0.5">
                                          {(o.items ?? []).map((it, i) => (
                                            <li key={i} className="flex justify-between gap-4">
                                              <span>{it.quantity}× {it.name} {it.dose}</span>
                                              <span className="text-[oklch(0.45_0.01_260)] whitespace-nowrap">{it.price === 0 ? "Free" : `$${(it.price * it.quantity).toFixed(2)}`}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    <div className="pt-1"><span className="font-semibold">Ordered:</span> {formatDateEST(o.created_at)}</div>
                                    {o.confirmed_at && (
                                      <div><span className="font-semibold">Paid:</span> {formatDateEST(o.confirmed_at)}</div>
                                    )}
                                    {payLabel(o.pay_currency) && (
                                      <div>
                                        <span className="font-semibold">Paid with:</span> {payLabel(o.pay_currency)}
                                        {o.pay_amount ? ` (${o.pay_amount} ${(o.pay_currency ?? "").toUpperCase()})` : ""}
                                      </div>
                                    )}
                                    {o.tracking_number && (
                                      <div><span className="font-semibold">Tracking:</span> {o.carrier ? `${o.carrier} ` : ""}{o.tracking_number}</div>
                                    )}
                                    {o.cancel_reason && (
                                      <div><span className="font-semibold">Cancel reason:</span> {o.cancel_reason}</div>
                                    )}
                                  </div>

                                  {/* Totals breakdown */}
                                  <div className="space-y-1 min-w-[180px]">
                                    <p className="font-semibold text-[oklch(0.20_0.01_260)]">Totals</p>
                                    <div className="flex justify-between gap-6"><span>Subtotal</span><span>${Number(o.gross_amount ?? o.net_amount).toFixed(2)}</span></div>
                                    {Number(o.discount_amount) > 0 && (
                                      <div className="flex justify-between gap-6 text-[oklch(0.35_0.14_155)]">
                                        <span>Discount{o.discount_code ? ` (${o.discount_code})` : ""}</span>
                                        <span>−${Number(o.discount_amount).toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between gap-6 font-semibold text-[oklch(0.13_0.01_260)] border-t border-[oklch(0.90_0.004_260)] pt-1">
                                      <span>Total</span><span>${Number(o.net_amount).toFixed(2)}</span>
                                    </div>
                                    {Number(o.commission_amount) > 0 && (
                                      <div className="flex justify-between gap-6 text-[oklch(0.52_0.01_260)]"><span>Commission</span><span>${Number(o.commission_amount).toFixed(2)}</span></div>
                                    )}
                                  </div>

                                  {/* Shipping address */}
                                  <div className="space-y-1 min-w-[200px]">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-[oklch(0.20_0.01_260)]">Ship to</p>
                                      {addressLines(o.shipping_address).length > 0 && (
                                        <button onClick={() => copyAddress(o)} className="text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">
                                          {copiedOrder === o.id ? "Copied!" : "Copy"}
                                        </button>
                                      )}
                                    </div>
                                    {addressLines(o.shipping_address).length === 0 ? (
                                      <p className="text-[oklch(0.60_0.01_260)]">No address on file</p>
                                    ) : (
                                      <div className="whitespace-pre-line leading-snug">{addressLines(o.shipping_address).join("\n")}</div>
                                    )}
                                  </div>

                                  {/* Email log + resend */}
                                  <div className="space-y-1 min-w-[260px]">
                                    <p className="font-semibold text-[oklch(0.20_0.01_260)] flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Emails</p>
                                    {EMAIL_EVENTS.filter((e) => e.applies(o)).map(({ event, label }) => {
                                      const sentAt = o.emails_sent?.[event];
                                      return (
                                        <div key={event} className="flex items-center justify-between gap-3">
                                          <span className="text-[0.75rem]">
                                            {label}
                                            <span className={`ml-1.5 ${sentAt ? "text-[oklch(0.45_0.13_155)]" : "text-[oklch(0.60_0.01_260)]"}`}>
                                              {sentAt ? `✓ ${formatDateEST(sentAt)}` : "not sent"}
                                            </span>
                                          </span>
                                          <button
                                            onClick={() => orderAction(o.id, "resend_email", { event })}
                                            disabled={busy}
                                            className="text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline disabled:opacity-50"
                                          >
                                            {sentAt ? "Resend" : "Send"}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {orderTotal > ORDERS_PER_PAGE && (
              <div className="flex items-center justify-between mt-5 text-[0.8125rem]">
                <span className="text-[oklch(0.52_0.01_260)]">
                  Page {orderPage} of {Math.ceil(orderTotal / ORDERS_PER_PAGE)} · {orderTotal} orders
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                    disabled={orderPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-[oklch(0.88_0.004_260)] font-semibold text-[oklch(0.35_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setOrderPage((p) => (p < Math.ceil(orderTotal / ORDERS_PER_PAGE) ? p + 1 : p))}
                    disabled={orderPage >= Math.ceil(orderTotal / ORDERS_PER_PAGE)}
                    className="px-3 py-1.5 rounded-lg border border-[oklch(0.88_0.004_260)] font-semibold text-[oklch(0.35_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Self-contained tabs (own their state + data fetching) ───────── */}
        {tab === "shipping" && <ShippingTab />}
        {tab === "affiliates" && <AffiliatesTab onMutate={loadData} />}
        {tab === "promos" && <PromosTab />}
        {tab === "customers" && <CustomersTab />}
      </div>
    </div>
  );
}
