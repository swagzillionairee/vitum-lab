import { supabaseAdmin } from "./_lib/supabase-admin.js";
import { requireUser } from "./_lib/requireUser.js";
import { sendWelcome, deferEmail } from "./_lib/email.js";

/**
 * Returns the role of the logged-in user so the client can route them
 * to the right dashboard (admin > affiliate > customer).
 * Also sends the one-time welcome email on the first authenticated call
 * (deduped via a `welcomed` flag in the auth user's metadata).
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

  // Welcome email — entirely after the response; never blocks role lookup.
  deferEmail(
    (async () => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.welcomed) return;
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, welcomed: true },
      });
      await sendWelcome(user.email);
    })(),
  );

  res.status(200).json({
    email: user.email,
    isAdmin: !!admin,
    isAffiliate: !!affiliate,
  });
}
