import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";

const url = requireEnv("SUPABASE_URL", "all database access");
const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY", "all database access");

// Vercel's per-function type pass currently resolves SupabaseAuthClient through
// a narrowed conditional export that omits getUser/admin. Keep the database
// surface strongly typed while isolating that third-party mismatch to auth.
type ServerSupabaseClient = Omit<SupabaseClient, "auth"> & { auth: any };

export const supabaseAdmin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
}) as ServerSupabaseClient;
