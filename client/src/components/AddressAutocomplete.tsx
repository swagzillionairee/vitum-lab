/*
 * AddressAutocomplete.tsx — Vitum Lab
 * Street-address input with Google Places suggestions (new AutocompleteSuggestion API).
 *
 * - Activates only when VITE_GOOGLE_MAPS_API_KEY is set; otherwise behaves as a
 *   plain input (browser native autofill still works) so checkout never breaks.
 * - On selection, parses address components and calls onSelect with the
 *   structured fields so the parent can fill city/state/ZIP/country.
 */

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

export interface ParsedAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface Suggestion {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prediction: any;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (parsed: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseComponents(components: any[]): ParsedAddress {
  const get = (type: string, short = false) => {
    const c = components.find((x) => (x.types as string[]).includes(type));
    return c ? (short ? c.shortText : c.longText) : "";
  };
  const streetNumber = get("street_number");
  const route = get("route");
  const city = get("locality") || get("postal_town") || get("sublocality") || get("administrative_area_level_2");
  return {
    line1: [streetNumber, route].filter(Boolean).join(" "),
    city,
    state: get("administrative_area_level_1", true),
    postal_code: get("postal_code"),
    country: get("country", true),
  };
}

export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const readyRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Load Places library once (no-op when no API key).
  useEffect(() => {
    const p = loadGoogleMaps();
    if (!p) return;
    let cancelled = false;
    p.then(async () => {
      const g = (window as unknown as { google: { maps: { importLibrary: (n: string) => Promise<unknown> } } }).google;
      const lib = await g.maps.importLibrary("places");
      if (!cancelled) {
        placesRef.current = lib;
        readyRef.current = true;
        if (!(lib as { AutocompleteSuggestion?: unknown }).AutocompleteSuggestion) {
          console.error("[AddressAutocomplete] Places (New) AutocompleteSuggestion not available — is 'Places API (New)' enabled for this key?");
        }
      }
    }).catch((e) => { console.error("[AddressAutocomplete] Google Maps failed to load:", e); });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = (input: string) => {
    if (!readyRef.current || !placesRef.current || input.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const { AutocompleteSuggestion, AutocompleteSessionToken } = placesRef.current;
    if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
    AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      sessionToken: tokenRef.current,
      includedRegionCodes: ["us", "ca"],
    })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ suggestions: results }: { suggestions: any[] }) => {
        const mapped: Suggestion[] = (results ?? [])
          .filter((r) => r.placePrediction)
          .map((r) => ({ text: r.placePrediction.text?.text ?? "", prediction: r.placePrediction }));
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
        setActive(-1);
      })
      .catch((e: unknown) => {
        console.error("[AddressAutocomplete] fetchAutocompleteSuggestions failed:", e);
        setSuggestions([]);
        setOpen(false);
      });
  };

  const handleInput = (input: string) => {
    onChange(input);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(input), 300);
  };

  const choose = async (s: Suggestion) => {
    setOpen(false);
    setSuggestions([]);
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents"] });
      const parsed = parseComponents(place.addressComponents ?? []);
      onChange(parsed.line1 || s.text);
      onSelect(parsed);
    } catch {
      onChange(s.text);
    }
    tokenRef.current = null; // renew session token after a selection
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(suggestions[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        // Suppress the browser's native autofill so the Google Places dropdown
        // (rendered in-page) isn't covered by Chrome's own address popup.
        autoComplete="off"
        name="vitum-shipping-street"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-[oklch(0.88_0.004_260)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 text-[0.8125rem] cursor-pointer ${i === active ? "bg-[oklch(0.96_0.02_260)] text-[oklch(0.30_0.16_260)]" : "text-[oklch(0.30_0.01_260)]"}`}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
