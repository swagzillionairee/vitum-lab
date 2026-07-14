import { isIP } from "node:net";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
};

function validIp(value: string | string[] | null | undefined): string | null {
  const candidate = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

/**
 * Resolve a non-spoofable client address for abuse-control buckets.
 *
 * Vercel's official `ipAddress()` helper reads `x-real-ip`; that header is
 * trustworthy at Vercel's edge, but a client could forge it when this same app
 * is run directly through the bundled Express server. Trust it only when the
 * Vercel runtime marker is present and otherwise use the TCP peer address.
 * Deliberately ignore x-forwarded-for unless a future deployment explicitly
 * configures and validates its own trusted reverse-proxy chain.
 */
export function clientIp(req: RequestLike): string {
  if (process.env.VERCEL) {
    const edgeIp = validIp(req.headers["x-real-ip"]);
    if (edgeIp) return edgeIp;
  }

  return validIp(req.socket?.remoteAddress) ?? "unknown";
}
