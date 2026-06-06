import { supabaseAdmin } from "../server/lib/supabase-admin";
import { requireUser } from "../server/lib/requireUser";

/**
 * Returns the role of the logged-in user so the client can route them
 * to the right dashboard (admin > affiliate > customer).
 */
export default async function handler(req: any, res: any) {
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [{ data: admin }, { data: affiliate }] = await Promise.all([
    supabaseAdmin.from("admins").select("id").eq("email", user.email).maybeSingle(),
    supabaseAdmin.from("affiliates").select("id").or(`email.eq.${user.email},user_id.eq.${user.id}`).maybeSingle(),
  ]);

  res.status(200).json({
    email: user.email,
    isAdmin: !!admin,
    isAffiliate: !!affiliate,
  });
}
