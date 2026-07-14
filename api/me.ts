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

  const [{ data: admin }, affiliate] = await Promise.all([
    supabaseAdmin.from("admins").select("id").eq("email", user.email).maybeSingle(),
    // Match a CURATED affiliate (is_referral=false) by email OR a previously
    // linked user_id — done as two typed .eq() lookups rather than a string-built
    // .or() filter (an email can contain characters that are special inside
    // PostgREST's `.or()` grammar). Self-serve referral rows (is_referral=true)
    // must NOT flip isAffiliate, or a referral participant would be routed to the
    // affiliate dashboard and clear the affiliate-only endpoints.
    (async () => {
      const byEmail = await supabaseAdmin.from("affiliates").select("id").eq("email", user.email).eq("is_referral", false).maybeSingle();
      if (byEmail.data) return byEmail.data;
      const byUser = await supabaseAdmin.from("affiliates").select("id").eq("user_id", user.id).eq("is_referral", false).maybeSingle();
      return byUser.data;
    })(),
  ]);

  // Welcome email — entirely after the response; never blocks role lookup.
  // Dedupe is ATOMIC: a check-then-set on the auth metadata `welcomed` flag
  // raced when the client fired several /api/me calls at once (each saw the flag
  // unset and sent a duplicate). The insert into welcome_sent (email PK) lets
  // exactly one concurrent caller win the claim; a 23505 means another already
  // sent it. The legacy metadata flag is still honored so existing welcomed
  // users are never re-mailed.
  deferEmail(
    (async () => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.welcomed) return; // already welcomed before this table existed

      const { error: claimErr } = await supabaseAdmin.from("welcome_sent").insert({ email: user.email });
      if (claimErr) return; // 23505 (or any error) → another request owns the claim; don't send

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
