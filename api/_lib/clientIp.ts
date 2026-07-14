/*
 * clientIp.ts — resolve the real client IP for rate-limiting on Vercel.
 *
 * DO NOT trust the leftmost X-Forwarded-For hop: a client can prepend arbitrary
 * values, and Vercel's edge APPENDS the true connecting IP to the RIGHT. Reading
 * xff.split(",")[0] therefore returns an attacker-controlled string, letting an
 * attacker mint unlimited rate-limit buckets. Vercel exposes the trustworthy
 * client IP via `x-real-ip` (a single value set by the edge); prefer it, then
 * fall back to the LAST hop of x-forwarded-for (the real connecting client).
 */
export function clientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const header = (name: string): string => {
    const v = req.headers[name] ?? req.headers[name.toLowerCase()];
    return Array.isArray(v) ? (v[0] ?? "") : String(v ?? "");
  };

  const realIp = header("x-real-ip").trim();
  if (realIp) return realIp;

  const xff = header("x-forwarded-for");
  const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (hops.length > 0) return hops[hops.length - 1]; // real connecting hop is last on Vercel

  return "unknown";
}
