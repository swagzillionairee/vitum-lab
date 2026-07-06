import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { requireUser } from "../_lib/requireUser.js";
import { getBalance, getOrCreateReferralCode } from "../_lib/credit.js";

/**
 * Handles all /api/account/* routes for the logged-in customer:
 *  - GET /api/account/orders  — order history (matched by email, so orders
 *    placed before the account existed appear too) with fulfillment/tracking
 *    fields for the status timeline.
 *  - GET /api/account/profile — saved shipping address (auth user metadata,
 *    falling back to the most recent order's address).
 *  - PUT /api/account/profile — save the shipping address.
 */
export default async function handler(req: any, res: any) {
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const pathname = ((req.url as string) ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/account\/?/, "").split("/")[0];

  if (route === "orders") {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, items, gross_amount, discount_amount, net_amount, shipping_amount, status, fulfillment_status, tracking_number, carrier, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at, cancel_reason, shipping_address",
      )
      .eq("email", user.email)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
      return;
    }
    res.status(200).json({ orders: data });
    return;
  }

  if (route === "profile") {
    if (req.method === "GET") {
      const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      let address = meta.shipping_address ?? null;

      if (!address) {
        // Fall back to the most recent order's address for returning customers.
        const { data: lastOrder } = await supabaseAdmin
          .from("orders")
          .select("shipping_address")
          .eq("email", user.email)
          .not("shipping_address", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        address = lastOrder?.shipping_address ?? null;
      }

      res.status(200).json({ shipping_address: address });
      return;
    }

    if (req.method === "PUT") {
      const { shipping_address } = req.body as {
        shipping_address?: {
          name?: string; line1?: string; line2?: string; city?: string;
          state?: string; postal_code?: string; country?: string; phone?: string;
        };
      };
      if (!shipping_address?.line1) {
        res.status(400).json({ error: "shipping_address with line1 is required" });
        return;
      }
      const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, shipping_address },
      });
      if (error) {
        res.status(500).json({ error: "Failed to save address" });
        return;
      }
      res.status(200).json({ shipping_address });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // ── GET /api/account/credit — store-credit balance + recent ledger ──────────
  if (route === "credit") {
    if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }
    const balance = await getBalance(user.email);
    const { data: ledger } = await supabaseAdmin
      .from("store_credit_ledger")
      .select("amount, reason, order_id, created_at")
      .eq("email", user.email)
      .order("created_at", { ascending: false })
      .limit(50);
    res.status(200).json({ balance, ledger: ledger ?? [] });
    return;
  }

  // ── GET /api/account/referral — the customer's referral code + share link ───
  if (route === "referral") {
    if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }
    const code = await getOrCreateReferralCode(user.email);
    const baseUrl = process.env.BASE_URL || "https://vitumlab.com";
    res.status(200).json({ code, link: `${baseUrl}/?ref=${code}` });
    return;
  }

  // ── GET /api/account/referral-program — the signed-in customer's self-serve
  // referral code + live dashboard. Account-locked: the code is tied to the
  // auth user (user_id), so it can't be lost or claimed by someone else. Lazily
  // creates (or adopts a legacy by-email) code on first view. ─────────────────
  if (route === "referral-program") {
    if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { data: cfg } = await supabaseAdmin
      .from("store_settings")
      .select("referral_program_active, referral_buyer_discount, referral_bounty_amount, referral_bounty_orders")
      .maybeSingle();
    if (!cfg?.referral_program_active) { res.status(200).json({ active: false }); return; }

    const buyerDiscount = Math.max(0, Math.min(100, Number(cfg.referral_buyer_discount) || 10));
    const bountyOrders = Math.max(1, Number(cfg.referral_bounty_orders) || 5);
    const bountyAmount = Math.max(0, Number(cfg.referral_bounty_amount) || 100);

    // 1) Already have a code tied to this account?
    let ref: { id: string; code: string } | null = null;
    {
      const { data } = await supabaseAdmin
        .from("affiliates")
        .select("id, code")
        .eq("is_referral", true)
        .eq("user_id", user.id)
        .maybeSingle();
      ref = data ?? null;
    }

    // 2) Adopt a legacy by-email code (created before account-locking) → bind it.
    if (!ref) {
      const { data: byEmail } = await supabaseAdmin
        .from("affiliates")
        .select("id, code")
        .eq("is_referral", true)
        .eq("email", user.email)
        .is("user_id", null)
        .maybeSingle();
      if (byEmail) {
        await supabaseAdmin.from("affiliates").update({ user_id: user.id }).eq("id", byEmail.id);
        ref = { id: byEmail.id, code: byEmail.code };
      }
    }

    // 3) Lazily create a fresh, unique code (from the name, else the email local-part).
    if (!ref) {
      const { data: udata } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (udata.user?.user_metadata ?? {}) as Record<string, unknown>;
      const rawName = String(meta.full_name ?? meta.name ?? "").trim();
      const seed = rawName ? rawName.split(/\s+/)[0] : user.email.split("@")[0];
      const base = (String(seed).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)) || "REF";
      const { data: taken } = await supabaseAdmin.from("affiliates").select("code").ilike("code", `${base}%`);
      const takenSet = new Set((taken ?? []).map((r: any) => String(r.code).toUpperCase()));
      let code = base;
      let n = 2;
      while (takenSet.has(code)) code = `${base}${n++}`;

      const { data: inserted, error } = await supabaseAdmin
        .from("affiliates")
        .insert({
          code, name: rawName || null, email: user.email, is_referral: true, user_id: user.id,
          discount_percent: buyerDiscount, commission_percent: 0,
        })
        .select("id, code")
        .maybeSingle();
      if (error || !inserted) { res.status(500).json({ error: "Couldn't create your referral code — please try again." }); return; }
      ref = inserted;
    }

    // Paid referrals = confirmed/finished orders that carried this code.
    const { count } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("affiliate_id", ref.id)
      .in("status", ["confirmed", "finished"]);
    const paidOrders = count ?? 0;
    const payouts = Math.floor(paidOrders / bountyOrders);
    const baseUrl = process.env.BASE_URL || "https://vitumlab.com";

    res.status(200).json({
      active: true,
      code: ref.code,
      link: `${baseUrl}/?ref=${ref.code}`,
      buyer_discount: buyerDiscount,
      paid_orders: paidOrders,
      bounty_orders: bountyOrders,
      bounty_amount: bountyAmount,
      earned: payouts * bountyAmount,
      toward_next: paidOrders % bountyOrders,
      remaining_to_next: bountyOrders - (paidOrders % bountyOrders),
      claimable: paidOrders >= bountyOrders,
    });
    return;
  }

  res.status(404).json({ error: "Not found" });
}
