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
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [admin, affiliate] = await Promise.all([
    (async () => {
      const byUser = await supabaseAdmin.from("admins").select("id").eq("user_id", user.id).maybeSingle();
      if (byUser.data) return byUser.data;
      // Email is only a first-login bootstrap key. Never identify a different
      // auth identity through a role row that has already been linked.
      const byEmail = await supabaseAdmin
        .from("admins")
        .select("id")
        .eq("email", user.email)
        .is("user_id", null)
        .maybeSingle();
      return byEmail.data;
    })(),
    (async () => {
      const byUser = await supabaseAdmin
        .from("affiliates")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_referral", false)
        .maybeSingle();
      if (byUser.data) return byUser.data;
      const byEmail = await supabaseAdmin
        .from("affiliates")
        .select("id")
        .eq("email", user.email)
        .eq("is_referral", false)
        .is("user_id", null)
        .maybeSingle();
      return byEmail.data;
    })(),
  ]);

  // Welcome email — entirely after the response; never blocks role lookup.
  // The table insert is an atomic claim, so concurrent /api/me calls cannot all
  // observe an unset metadata flag and send duplicate welcome messages.
  deferEmail(
    (async () => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.welcomed) return;

      const { error: claimError } = await supabaseAdmin.from("welcome_sent").insert({ email: user.email });
      if (claimError) return;

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
