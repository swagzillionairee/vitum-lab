import { supabase } from "./supabase";

/**
 * fetch wrapper that attaches the current Supabase access token as a
 * Bearer header. Use for any authenticated (admin/affiliate/customer) call.
 */
export async function authedFetch(path: string, init?: RequestInit) {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
