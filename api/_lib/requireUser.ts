import { supabaseAdmin } from "./supabase-admin.js";

export interface AuthedUser {
  id: string;
  email: string;
}

/**
 * Validates the Supabase JWT on the request and returns the auth user.
 * Returns null if missing/invalid. Use for any logged-in customer route.
 */
export async function requireUser(req: any): Promise<AuthedUser | null> {
  const authHeader = (req.headers["authorization"] || req.headers["Authorization"]) as string | undefined;
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) return null;

  return { id: data.user.id, email: data.user.email.toLowerCase() };
}
