import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sendOrderEvent, sendLowStockDigest, sendAffiliateStatement, type EmailOrder } from "./_lib/email.js";
import { getTrackingStatus, shippoConfigured } from "./_lib/shippo.js";

const LOW_STOCK_THRESHOLD = 5;
// Send the low-stock digest once a day, at 14:00 UTC (~9–10am ET).
const LOW_STOCK_DIGEST_HOUR_UTC = 14;
// Post-delivery follow-up fires this many days after delivery.
const FOLLOWUP_AFTER_DAYS = 7;
// Affiliate monthly statements go out on the 1st of the month at 15:00 UTC.
const AFFILIATE_STATEMENT_HOUR_UTC = 15;

const ORDER_COLS =
  "id, email, items, gross_amount, discount_amount, discount_code, net_amount, shipping_amount, shipping_address, status, cancel_reason, emails_sent";
const ORDER_COLS_FULL =
  "id, email, items, gross_amount, discount_amount, discount_code, net_amount, shipping_amount, shipping_address, status, fulfillment_status, tracking_number, carrier, delivered_at, emails_sent";

// Affiliate monthly statements for the previous calendar month.
async function sendAffiliateStatements(results: { statements: number; errors: number }) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthLabel = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const { data: affs } = await supabaseAdmin.from("affiliates").select("id, email, code");
  if (!affs || affs.length === 0) return;
  const { data: payouts } = await supabaseAdmin.from("affiliate_payouts").select("affiliate_id, amount");

  const lifetime: Record<string, number> = {};
  const monthCommission: Record<string, number> = {};
  const monthOrders: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data: batch } = await supabaseAdmin
      .from("orders")
      .select("affiliate_id, commission_amount, confirmed_at, status")
      .in("status", ["confirmed", "finished"])
      .not("affiliate_id", "is", null)
      // Stable order: Postgres gives no ordering guarantee across ranged reads,
      // so an un-ordered paged loop can skip/double-count rows past page 1.
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    for (const o of batch ?? []) {
      const aid = o.affiliate_id as string;
      const c = Number(o.commission_amount) || 0;
      lifetime[aid] = (lifetime[aid] ?? 0) + c;
      const ca = o.confirmed_at ? new Date(o.confirmed_at as string) : null;
      if (ca && ca >= start && ca < end) {
        monthCommission[aid] = (monthCommission[aid] ?? 0) + c;
        monthOrders[aid] = (monthOrders[aid] ?? 0) + 1;
      }
    }
    if (!batch || batch.length < 1000) break;
  }
  const paidOut: Record<string, number> = {};
  for (const p of payouts ?? []) paidOut[p.affiliate_id as string] = (paidOut[p.affiliate_id as string] ?? 0) + (Number(p.amount) || 0);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const a of affs) {
    if (!a.email) continue;
    const owed = r2((lifetime[a.id] ?? 0) - (paidOut[a.id] ?? 0));
    if ((monthOrders[a.id] ?? 0) === 0 && owed <= 0) continue; // nothing to report
    try {
      await sendAffiliateStatement(a.email as string, {
        code: a.code as string,
        monthLabel,
        orders: monthOrders[a.id] ?? 0,
        commission: r2(monthCommission[a.id] ?? 0),
        paidOut: r2(paidOut[a.id] ?? 0),
        owed,
      });
      results.statements++;
    } catch (err) {
      console.error(`cron: statement failed for ${a.email}:`, err);
      results.errors++;
    }
  }
}

/**
 * Hourly maintenance endpoint, invoked by pg_cron + pg_net with a shared
 * secret. Work:
 *  1. Expire pending orders older than 24h (cancel + customer email).
 *  2. Sweep: email any recently auto-expired orders that never got their
 *     cancellation email (covers orders expired by the legacy SQL job).
 * Both steps are idempotent — emails are deduped via orders.emails_sent.
 */
export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers["x-cron-secret"] as string) || (req.query?.secret as string) || "";
  if (!secret || provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const results = { expired: 0, emailed: 0, errors: 0, lowStockDigest: 0, delivered: 0, followup: 0, statements: 0 };

  try {
    // 1. Expire stale pending orders (mirrors the expire_stale_orders pg_cron
    // fn). Automated invoices (crypto/square/legacy-null) die at 24h; manual
    // transfers the admin verifies (Zelle/Cash App/Venmo/ACH) get 14 days.
    const MANUAL_METHODS = ["zelle", "cashapp", "venmo", "ach"];
    const nowIso = new Date().toISOString();
    const cutoff24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const cutoff14d = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const expired: any[] = [];
    // Automated: crypto/square, or legacy rows with no payment_method.
    const { data: autoExpired } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", cancelled_at: nowIso, cancel_reason: "auto-expired: payment not received in time" })
      .eq("status", "pending")
      .lt("created_at", cutoff24)
      .or("payment_method.is.null,payment_method.eq.crypto,payment_method.eq.square")
      .select(ORDER_COLS);
    expired.push(...(autoExpired ?? []));
    // Manual transfers — longer grace window.
    const { data: manualExpired } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", cancelled_at: nowIso, cancel_reason: "auto-expired: payment not received in time" })
      .eq("status", "pending")
      .lt("created_at", cutoff14d)
      .in("payment_method", MANUAL_METHODS)
      .select(ORDER_COLS);
    expired.push(...(manualExpired ?? []));
    results.expired = expired.length;

    for (const order of expired ?? []) {
      try {
        if (await sendOrderEvent(order as EmailOrder, "cancelled", { wasPending: true })) results.emailed++;
      } catch (err) {
        console.error(`cron: cancelled email failed for ${order.id}:`, err);
        results.errors++;
      }
    }

    // 1b. Backstop: release one-use discount slots (promo/referral) held by orders
    // that have since died or vanished, so the code becomes usable again. Covers
    // the paths that don't release inline (SQL expiry job, admin cancel, webhook
    // failure). Explicit release at checkout handles the synchronous-failure paths.
    try {
      await supabaseAdmin.rpc("sweep_discount_redemptions");
    } catch (err) {
      console.error("cron: discount-redemption sweep failed:", err);
      results.errors++;
    }

    // 2. Sweep auto-expired orders (last 7 days) missing their email.
    const sweepSince = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { data: unemailed } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLS)
      .eq("status", "cancelled")
      .like("cancel_reason", "auto-expired%")
      .gte("created_at", sweepSince)
      .filter("emails_sent->cancelled", "is", "null")
      .limit(100);

    for (const order of unemailed ?? []) {
      try {
        if (await sendOrderEvent(order as EmailOrder, "cancelled", { wasPending: true })) results.emailed++;
      } catch (err) {
        console.error(`cron: sweep email failed for ${order.id}:`, err);
        results.errors++;
      }
    }

    // 3. Low-stock digest to INVENTORY_EMAIL — once per day.
    if (new Date().getUTCHours() === LOW_STOCK_DIGEST_HOUR_UTC) {
      const { data: inv } = await supabaseAdmin.from("inventory").select("cart_code, stock");
      const low = (inv ?? [])
        .filter((r) => r.stock <= LOW_STOCK_THRESHOLD)
        .sort((a, b) => a.stock - b.stock)
        .map((r) => ({ cartCode: r.cart_code as string, stock: r.stock as number }));
      if (low.length > 0) {
        try {
          await sendLowStockDigest(low);
          results.lowStockDigest = low.length;
        } catch (err) {
          console.error("cron: low-stock digest failed:", err);
          results.errors++;
        }
      }
    }

    // 4. Auto-detect USPS delivery via Shippo for shipped orders w/ tracking.
    if (shippoConfigured()) {
      const { data: inTransit } = await supabaseAdmin
        .from("orders")
        .select(ORDER_COLS_FULL)
        .eq("fulfillment_status", "shipped")
        .not("tracking_number", "is", null)
        .limit(60);
      for (const o of inTransit ?? []) {
        try {
          const status = await getTrackingStatus(o.tracking_number as string);
          if (status === "DELIVERED") {
            await supabaseAdmin.from("orders").update({ fulfillment_status: "delivered", delivered_at: new Date().toISOString() }).eq("id", o.id);
            await sendOrderEvent(o as EmailOrder, "delivered");
            await sendOrderEvent(o as EmailOrder, "admin_delivered");
            results.delivered++;
          }
        } catch (err) {
          console.error(`cron: delivery poll failed for ${o.id}:`, err);
          results.errors++;
        }
      }
    }

    // 5. Post-delivery follow-up — FOLLOWUP_AFTER_DAYS after delivery, once.
    const followupBefore = new Date(Date.now() - FOLLOWUP_AFTER_DAYS * 86400 * 1000).toISOString();
    const { data: toFollow } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLS_FULL)
      .eq("fulfillment_status", "delivered")
      .lt("delivered_at", followupBefore)
      .filter("emails_sent->followup", "is", "null")
      .limit(50);
    for (const o of toFollow ?? []) {
      try {
        if (await sendOrderEvent(o as EmailOrder, "followup")) results.followup++;
      } catch (err) {
        console.error(`cron: followup failed for ${o.id}:`, err);
        results.errors++;
      }
    }

    // 6. Affiliate monthly statements — 1st of the month at 15:00 UTC.
    const nowDate = new Date();
    if (nowDate.getUTCDate() === 1 && nowDate.getUTCHours() === AFFILIATE_STATEMENT_HOUR_UTC) {
      await sendAffiliateStatements(results);
    }

    res.status(200).json(results);
  } catch (err) {
    console.error("cron error:", err);
    res.status(500).json({ error: "cron failed", ...results });
  }
}
