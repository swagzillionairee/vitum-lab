/*
 * promo.ts — capture & persist a discount/affiliate code shared via URL.
 * An affiliate link like https://vitumlab.com/shop?code=ACG10 drops the code
 * here on landing; checkout auto-applies it (resolving the discount and, for
 * affiliate codes, the attribution) so affiliates only share one clean link.
 */

const KEY = "vitum_promo";

/** Read ?code= / ?ref= / ?promo= from the current URL, persist it, and strip it. */
export function capturePromoFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || params.get("ref") || params.get("promo");
    if (!code?.trim()) return;
    localStorage.setItem(KEY, code.trim().toUpperCase());
    // Remove the param so it doesn't linger in the address bar / shares.
    params.delete("code");
    params.delete("ref");
    params.delete("promo");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  } catch {
    /* localStorage / history may be unavailable — ignore */
  }
}

export function getPromoCode(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function clearPromoCode(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
