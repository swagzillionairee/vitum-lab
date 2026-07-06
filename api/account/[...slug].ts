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
      .select("referral_program_active, referral_buyer_discount, referral_bounty_amount, referral_bounty_orders, referral_min_order")
      .maybeSingle();
    if (!cfg?.referral_program_active) { res.status(200).json({ active: false }); return; }

    const buyerDiscount = Math.max(0, Math.min(100, Number(cfg.referral_buyer_discount) || 10));
    const bountyOrders = Math.max(1, Number(cfg.referral_bounty_orders) || 5);
    const bountyAmount = Math.max(0, Number(cfg.referral_bounty_amount) || 100);
    const minOrder = Math.max(0, Number(cfg.referral_min_order) || 0);

    // 0) Already a curated affiliate? The affiliates table is one-code-per-email,
    // so we can't mint a second (referral) code for this account — and they don't
    // need one: their affiliate code already gives buyers a discount AND earns a
    // % commission. Point them to their affiliate dashboard instead of erroring.
    {
      const { data: aff } = await supabaseAdmin
        .from("affiliates")
        .select("code")
        .eq("is_referral", false)
        .or(`user_id.eq.${user.id},email.eq.${user.email}`)
        .limit(1)
        .maybeSingle();
      if (aff) { res.status(200).json({ active: true, already_affiliate: true, affiliate_code: aff.code }); return; }
    }

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
    // The affiliates.code UNIQUE constraint is the source of truth: two people can
    // NEVER end up with the same code. We propose a candidate, but if a concurrent
    // signup grabbed it first the insert 23505s — so we retry with the next suffix
    // (then a random one) until it lands, rather than erroring out.
    if (!ref) {
      const { data: udata } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (udata.user?.user_metadata ?? {}) as Record<string, unknown>;
      const rawName = String(meta.full_name ?? meta.name ?? "").trim();
      const seed = rawName ? rawName.split(/\s+/)[0] : user.email.split("@")[0];
      const base = (String(seed).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)) || "REF";
      const { data: taken } = await supabaseAdmin.from("affiliates").select("code").ilike("code", `${base}%`);
      const takenSet = new Set((taken ?? []).map((r: any) => String(r.code).toUpperCase()));

      // Candidate stream: BASE, BASE2, BASE3, … then BASE+4 random chars as a
      // collision-proof fallback so we always terminate.
      let n = 1;
      const charForAttempt = () => {
        const c = n === 1 ? base : n <= 200 ? `${base}${n}` : `${base}${Math.abs((user.id.charCodeAt(n % user.id.length) * n) % 9000) + 1000}`;
        n += 1;
        return c;
      };
      let candidate = charForAttempt();
      while (takenSet.has(candidate.toUpperCase())) candidate = charForAttempt();

      for (let attempt = 0; attempt < 8 && !ref; attempt++) {
        const { data: inserted, error } = await supabaseAdmin
          .from("affiliates")
          .insert({
            code: candidate, name: rawName || null, email: user.email, is_referral: true, user_id: user.id,
            discount_percent: buyerDiscount, commission_percent: 0,
          })
          .select("id, code")
          .maybeSingle();
        if (inserted) { ref = inserted; break; }
        // 23505 = unique_violation. If the CODE was taken by a race, try the next
        // candidate. If it's the user_id/email that collided, this account already
        // has a code — re-fetch it and use that (idempotent).
        if (error?.code === "23505") {
          const { data: mine } = await supabaseAdmin
            .from("affiliates").select("id, code").eq("is_referral", true).eq("user_id", user.id).maybeSingle();
          if (mine) { ref = mine; break; }
          candidate = charForAttempt();
          continue;
        }
        break; // non-conflict error — stop retrying
      }
      if (!ref) { res.status(500).json({ error: "Couldn't create your referral code — please try again." }); return; }
    }

    // Qualifying referrals = UNIQUE buyers (distinct email) who placed a
    // confirmed/finished order with this code that clears the minimum — and who
    // aren't the referrer. Refunded/cancelled orders fall out automatically
    // (they leave confirmed/finished), so a refund claws the referral back. One
    // buyer ordering repeatedly counts once, so a single friend can't farm a payout.
    const { data: refOrders } = await supabaseAdmin
      .from("orders")
      .select("email, net_amount")
      .eq("affiliate_id", ref.id)
      .in("status", ["confirmed", "finished"]);
    const qualifiedBuyers = new Set(
      (refOrders ?? [])
        .filter((o) => Number(o.net_amount ?? 0) >= minOrder && (o.email ?? "").toLowerCase() !== user.email)
        .map((o) => (o.email ?? "").toLowerCase()),
    );
    const paidOrders = qualifiedBuyers.size;
    const payouts = Math.floor(paidOrders / bountyOrders);
    const baseUrl = process.env.BASE_URL || "https://vitumlab.com";

    res.status(200).json({
      active: true,
      code: ref.code,
      link: `${baseUrl}/?ref=${ref.code}`,
      buyer_discount: buyerDiscount,
      min_order: minOrder,
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
