/*
 * googleMaps.ts — lazy loader for the Google Maps JS API (Places library).
 *
 * Uses Google's official inline bootstrap loader, which defines
 * google.maps.importLibrary(). A plain <script> tag does NOT define
 * importLibrary, so callers must go through this.
 *
 * Returns null when VITE_GOOGLE_MAPS_API_KEY is not set, so callers fall back
 * to plain inputs (native browser autofill) and checkout never breaks.
 */

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loadPromise: Promise<unknown> | null = null;

export function googleMapsEnabled(): boolean {
  return Boolean(API_KEY);
}

export function loadGoogleMaps(): Promise<unknown> | null {
  if (!API_KEY) return null;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { google?: { maps?: { importLibrary?: unknown } } };
    if (w.google?.maps?.importLibrary) {
      resolve(w.google.maps);
      return;
    }
    try {
      bootstrapGoogleMaps(API_KEY);
      // The bootstrap defines google.maps.importLibrary synchronously.
      resolve((window as unknown as { google: { maps: unknown } }).google.maps);
    } catch (e) {
      reject(e);
    }
  });

  return loadPromise;
}

/* eslint-disable */
// Official Google Maps JavaScript API inline bootstrap loader.
// Defines google.maps.importLibrary(); the actual script is fetched on first
// importLibrary() call. Adapted from Google's documented snippet.
function bootstrapGoogleMaps(key: string) {
  ((g: any) => {
    var h: any,
      a: any,
      k: any,
      p = "The Google Maps JavaScript API",
      c = "google",
      l = "importLibrary",
      q = "__ib__",
      m = document,
      b: any = window;
    b = b[c] || (b[c] = {});
    var d = b.maps || (b.maps = {}),
      r = new Set<string>(),
      e = new URLSearchParams(),
      u = () =>
        h ||
        (h = new Promise(async (f: any, n: any) => {
          a = m.createElement("script");
          e.set("libraries", Array.from(r).join(","));
          for (k in g) e.set(k.replace(/[A-Z]/g, (t: string) => "_" + t[0].toLowerCase()), g[k]);
          e.set("callback", c + ".maps." + q);
          a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
          d[q] = f;
          a.onerror = () => (h = n(Error(p + " could not load.")));
          a.nonce = (m.querySelector("script[nonce]") as any)?.nonce || "";
          m.head.append(a);
        }));
    d[l]
      ? console.warn(p + " only loads once. Ignoring:", g)
      : (d[l] = (f: any, ...n: any[]) => r.add(f) && u().then(() => d[l](f, ...n)));
  })({ key, v: "weekly" });
}
/* eslint-enable */
