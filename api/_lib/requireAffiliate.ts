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

  // Match by linked user_id first, then fall back to email (first login).
  const { data: byId } = await supabaseAdmin
    .from("affiliates")
    .select("id, code, name, discount_percent, commission_percent, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let affiliate = byId;

  if (!affiliate) {
    const { data: byEmail } = await supabaseAdmin
      .from("affiliates")
      .select("id, code, name, discount_percent, commission_percent, user_id")
      .eq("email", user.email)
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
