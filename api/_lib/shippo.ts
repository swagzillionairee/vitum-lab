/*
 * shippo.ts — USPS labels + tracking via Shippo.
 * The token (SHIPPO_API_KEY) decides test vs live mode, so no code change is
 * needed to go live — a test key returns SAMPLE labels + test tracking.
 * Everything ships as USPS Priority Mail Flat Rate Padded Envelope, so the
 * parcel/service is hard-coded (no per-order weight/dimension entry).
 */

const SHIPPO_API = "https://api.goshippo.com";

export interface ShippoAddress {
  name?: string; line1?: string; line2?: string; city?: string;
  state?: string; postal_code?: string; country?: string; phone?: string;
}

export interface LabelResult {
  tracking_number: string;
  carrier: string;
  label_url: string;
  tracking_url: string | null;
}

export function shippoConfigured(): boolean {
  return !!process.env.SHIPPO_API_KEY;
}

function fromAddress() {
  return {
    name: process.env.SHIP_FROM_NAME || "Vitum Lab",
    street1: process.env.SHIP_FROM_STREET1 || "",
    street2: process.env.SHIP_FROM_STREET2 || "",
    city: process.env.SHIP_FROM_CITY || "",
    state: process.env.SHIP_FROM_STATE || "",
    zip: process.env.SHIP_FROM_ZIP || "",
    country: process.env.SHIP_FROM_COUNTRY || "US",
    phone: process.env.SHIP_FROM_PHONE || "",
    // Auto-filled from the store's email — no separate ship-from email needed.
    email: process.env.SHIP_FROM_EMAIL || process.env.GMAIL_USER || "",
  };
}

/** The ship-from (return) address must be configured before buying labels. */
export function shipFromConfigured(): boolean {
  const f = fromAddress();
  return !!(f.street1 && f.city && f.state && f.zip);
}

/** USPS requires the sender to have a phone (email is auto-filled from GMAIL_USER). */
export function shipFromPhoneConfigured(): boolean {
  return !!(process.env.SHIP_FROM_PHONE && process.env.SHIP_FROM_PHONE.trim());
}

function headers() {
  return { Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`, "Content-Type": "application/json" };
}

/**
 * Buy a USPS Priority Mail Flat Rate Padded Envelope label for an order's
 * shipping address. Returns tracking number + label PDF URL.
 */
export async function buyLabel(order: { email: string; shipping_address?: ShippoAddress | null }): Promise<LabelResult> {
  const a = order.shipping_address;
  if (!a?.line1) throw new Error("Order has no shipping address");

  const address_to = {
    name: a.name || "",
    street1: a.line1,
    street2: a.line2 || "",
    city: a.city || "",
    state: a.state || "",
    zip: a.postal_code || "",
    country: a.country || "US",
    phone: a.phone || "",
    email: order.email || "",
  };

  // 1. Create the shipment (flat-rate padded envelope template; weight is
  //    required by Shippo even though flat rate ignores it for pricing).
  const shipRes = await fetch(`${SHIPPO_API}/shipments/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      address_from: fromAddress(),
      address_to,
      parcels: [{ template: "USPS_FlatRatePaddedEnvelope", weight: "8", mass_unit: "oz" }],
      async: false,
    }),
  });
  if (!shipRes.ok) throw new Error(`Shippo shipment failed: ${await shipRes.text()}`);
  const shipment = await shipRes.json();

  const rates: { object_id: string; provider?: string; servicelevel?: { token?: string; name?: string } }[] = shipment.rates ?? [];
  const rate =
    rates.find((r) => (r.provider || "").toUpperCase() === "USPS" && /priority/i.test(r.servicelevel?.token || r.servicelevel?.name || "")) ||
    rates.find((r) => (r.provider || "").toUpperCase() === "USPS") ||
    rates[0];
  if (!rate) throw new Error("Shippo returned no USPS rate for this address");

  // 2. Buy the label as a 4×6 PDF (matches a 4×6 thermal label printer).
  const txnRes = await fetch(`${SHIPPO_API}/transactions/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ rate: rate.object_id, label_file_type: "PDF_4x6", async: false }),
  });
  if (!txnRes.ok) throw new Error(`Shippo transaction failed: ${await txnRes.text()}`);
  const txn = await txnRes.json();
  if (txn.status !== "SUCCESS") {
    const msg = Array.isArray(txn.messages) ? txn.messages.map((m: { text?: string }) => m.text).join("; ") : txn.status;
    throw new Error(`Shippo label not purchased: ${msg}`);
  }

  return {
    tracking_number: txn.tracking_number,
    carrier: "USPS",
    label_url: txn.label_url,
    tracking_url: txn.tracking_url_provider ?? null,
  };
}

/**
 * Validate a shipping address with Shippo (best-effort). Returns { valid,
 * messages } — or null when validation is unavailable (no token / API error)
 * so the caller can fail open and never block checkout on a Shippo outage.
 */
export async function validateAddress(a: ShippoAddress): Promise<{ valid: boolean; messages: string[] } | null> {
  if (!shippoConfigured()) return null;
  try {
    const res = await fetch(`${SHIPPO_API}/addresses/`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: a.name || "",
        street1: a.line1 || "",
        street2: a.line2 || "",
        city: a.city || "",
        state: a.state || "",
        zip: a.postal_code || "",
        country: a.country || "US",
        validate: true,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vr = data?.validation_results;
    if (!vr || typeof vr.is_valid !== "boolean") return null;
    const messages: string[] = Array.isArray(vr.messages)
      ? vr.messages.map((m: { text?: string }) => m.text).filter(Boolean)
      : [];
    return { valid: vr.is_valid, messages };
  } catch {
    return null;
  }
}

/**
 * Current USPS tracking status for a number (e.g. "DELIVERED", "TRANSIT").
 * Hitting this endpoint also registers the number with Shippo for webhooks.
 */
export async function getTrackingStatus(tracking: string): Promise<string | null> {
  try {
    const res = await fetch(`${SHIPPO_API}/tracks/usps/${encodeURIComponent(tracking)}`, { headers: headers() });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.tracking_status?.status as string) ?? null;
  } catch {
    return null;
  }
}
