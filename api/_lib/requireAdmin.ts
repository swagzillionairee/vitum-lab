import { supabaseAdmin } from "./supabase-admin.js";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Verifies the request carries a valid Supabase JWT belonging to an admin.
 * Returns the admin record, or null if unauthorized. On first successful
 * login the admin's auth user_id is linked to the seeded email row.
 */
export async function requireAdmin(req: any): Promise<AdminUser | null> {
  const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as string | undefined;
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) return null;

  const authUser = userData.user;
  const email = authUser.email?.toLowerCase();
  if (!email) return null;

  const { data: admin } = await supabaseAdmin
    .from("admins")
    .select("id, email, name, user_id")
    .eq("email", email)
    .maybeSingle();

  if (!admin) return null;

  // Link the auth user_id on first login
  if (!admin.user_id) {
    await supabaseAdmin.from("admins").update({ user_id: authUser.id }).eq("id", admin.id);
  }

  return { id: admin.id, email: admin.email, name: admin.name };
}
