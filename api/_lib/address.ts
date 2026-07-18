export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
};

const LIMITS: Record<keyof ShippingAddress, number> = {
  name: 200,
  line1: 200,
  line2: 200,
  city: 100,
  state: 2,
  postal_code: 10,
  country: 2,
  phone: 40,
};

const REQUIRED: (keyof ShippingAddress)[] = ["name", "line1", "city", "state", "postal_code"];
const NON_CONTIGUOUS = new Set(["AK", "HI", "AS", "GU", "MP", "PR", "VI"]);

/** Normalize the only address fields we persist; reject oversized/non-US data. */
export function normalizeShippingAddress(value: unknown): ShippingAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const out = {} as ShippingAddress;

  for (const key of Object.keys(LIMITS) as (keyof ShippingAddress)[]) {
    const raw = source[key];
    if (raw != null && typeof raw !== "string") return null;
    out[key] = String(raw ?? "").trim();
    if (out[key].length > LIMITS[key]) return null;
  }
  if (REQUIRED.some(key => !out[key])) return null;

  out.state = out.state.toUpperCase();
  out.country = (out.country || "US").toUpperCase();
  if (!/^[A-Z]{2}$/.test(out.state) || NON_CONTIGUOUS.has(out.state)) return null;
  if (out.country !== "US") return null;
  if (!/^\d{5}(?:-\d{4})?$/.test(out.postal_code)) return null;
  return out;
}
