import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { sendOrderEvent, sendLowStockDigest, type EmailOrder } from "./_lib/email.js";

const LOW_STOCK_THRESHOLD = 5;
// Send the low-stock digest once a day, at 14:00 UTC (~9–10am ET).
const LOW_STOCK_DIGEST_HOUR_UTC = 14;

const ORDER_COLS =
  "id, email, items, gross_amount, discount_amount, discount_code, net_amount, shipping_address, status, cancel_reason, emails_sent";

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

  const results = { expired: 0, emailed: 0, errors: 0, lowStockDigest: 0 };

  try {
    // 1. Expire stale pending orders (mirrors the original pg_cron SQL).
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: expired } = await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "auto-expired: payment not received within 24h",
      })
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .select(ORDER_COLS);
    results.expired = expired?.length ?? 0;

    for (const order of expired ?? []) {
      try {
        if (await sendOrderEvent(order as EmailOrder, "cancelled", { wasPending: true })) results.emailed++;
      } catch (err) {
        console.error(`cron: cancelled email failed for ${order.id}:`, err);
        results.errors++;
      }
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

    res.status(200).json(results);
  } catch (err) {
    console.error("cron error:", err);
    res.status(500).json({ error: "cron failed", ...results });
  }
}
