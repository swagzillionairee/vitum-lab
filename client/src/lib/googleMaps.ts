/*
 * googleMaps.ts — lazy loader for the Google Maps JS API (Places library).
 *
 * Returns null when VITE_GOOGLE_MAPS_API_KEY is not set, so callers can fall
 * back to plain inputs (native browser autofill) and checkout never breaks.
 * The script is injected once and the promise is memoized across callers.
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
    const w = window as unknown as { google?: { maps?: unknown } };
    if (w.google?.maps) {
      resolve(w.google.maps);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: { maps: unknown } }).google.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
