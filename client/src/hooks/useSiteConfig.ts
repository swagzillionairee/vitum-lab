/*
 * One shared, cached fetch of /api/public/site per page load. SaleBanner sits
 * in the sticky header on every page, and several pages fetched the same
 * config again on mount — duplicate serverless + Supabase reads on the
 * critical render path. Failures are NOT cached, so a component retrying
 * later still gets a live attempt.
 */

export type SiteConfig = {
  sitewide?: { active: boolean; percent?: number; label?: string | null; ends_at?: string | null };
  quantity_tiers?: { min_qty: number; percent: number }[];
  featured_banner?: { active: boolean; text?: string; color?: string };
  referral_program?: Record<string, unknown>;
  payments?: unknown;
};

let cache: SiteConfig | null = null;
let inflight: Promise<SiteConfig> | null = null;

export function fetchSiteConfig(): Promise<SiteConfig> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/public/site")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<SiteConfig>;
      })
      .then((d) => {
        cache = d;
        return d;
      })
      .catch((err) => {
        inflight = null; // don't cache failures — let the next caller retry
        throw err;
      });
  }
  return inflight;
}
