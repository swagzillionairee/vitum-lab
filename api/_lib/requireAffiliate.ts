import { supabaseAdmin } from "./supabase-admin.js";
import { requireUser } from "./requireUser.js";

export interface Affiliate {
  id: string;
  code: string;
  name: string | null;
  discount_percent: number;
  commission_percent: number;
}

/**
 * Verifies the request's JWT belongs to a registered affiliate.
 * Links the affiliate's auth user_id on first login. Returns null if not an affiliate.
 */
export async function requireAffiliate(req: any): Promise<Affiliate | null> {
  const user = await requireUser(req);
  if (!user) return null;

  // CURATED affiliates only (is_referral = false). The self-serve referral
  // program stores its per-customer codes as is_referral=true rows in this same
  // table; those participants must NOT clear the affiliate gate, or they'd reach
  // the curated-affiliate endpoints (/api/affiliate/stats, /orders) and read
  // their referees' individual order amounts/IDs — data the referral dashboard
  // (/api/account/referral-program) deliberately reduces to an aggregate count.
  const { data: byId } = await supabaseAdmin
    .from("affiliates")
    .select("id, code, name, discount_percent, commission_percent, user_id")
    .eq("user_id", user.id)
    .eq("is_referral", false)
    .maybeSingle();

  let affiliate = byId;

  if (!affiliate) {
    const { data: byEmail } = await supabaseAdmin
      .from("affiliates")
      .select("id, code, name, discount_percent, commission_percent, user_id")
      .eq("email", user.email)
      .eq("is_referral", false)
      .maybeSingle();
    affiliate = byEmail;
    if (affiliate && !affiliate.user_id) {
      await supabaseAdmin.from("affiliates").update({ user_id: user.id }).eq("id", affiliate.id);
    }
  }

  if (!affiliate) return null;
  return {
    id: affiliate.id,
    code: affiliate.code,
    name: affiliate.name,
    discount_percent: affiliate.discount_percent,
    commission_percent: affiliate.commission_percent,
  };
}
