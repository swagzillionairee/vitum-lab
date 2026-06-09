/*
 * OrderTimeline.tsx — order lifecycle progress (Placed → Paid → Shipped →
 * Delivered, with cancelled/failed terminal branches). Used on the customer
 * /account page and inside the admin Orders expanded row.
 */

export interface TimelineOrder {
  status: string;
  fulfillment_status?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
}

/** Carrier-aware tracking link — USPS is the default (USPS-only shop). */
export function trackingUrl(carrier: string | null | undefined, tracking: string): string {
  const c = (carrier || "usps").toLowerCase();
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
}

function fmtShort(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Step {
  label: string;
  date: string | null | undefined;
  state: "done" | "bad" | "todo";
}

const DOT: Record<Step["state"], string> = {
  done: "bg-[oklch(0.55_0.14_155)]",
  bad: "bg-[oklch(0.58_0.20_25)]",
  todo: "bg-[oklch(0.88_0.004_260)]",
};

export default function OrderTimeline({ order }: { order: TimelineOrder }) {
  const cancelled = order.status === "cancelled";
  const failed = order.status === "failed";
  const paid = order.status === "confirmed" || order.status === "finished";
  const shipped = !!order.shipped_at || order.fulfillment_status === "shipped" || order.fulfillment_status === "delivered";
  const delivered = !!order.delivered_at || order.fulfillment_status === "delivered";

  const steps: Step[] = cancelled
    ? [
        { label: "Placed", date: order.created_at, state: "done" },
        { label: "Cancelled", date: order.cancelled_at, state: "bad" },
      ]
    : failed
    ? [
        { label: "Placed", date: order.created_at, state: "done" },
        { label: "Payment Failed", date: null, state: "bad" },
      ]
    : [
        { label: "Placed", date: order.created_at, state: "done" },
        { label: "Paid", date: order.confirmed_at, state: paid ? "done" : "todo" },
        { label: "Shipped", date: order.shipped_at, state: shipped ? "done" : "todo" },
        { label: "Delivered", date: order.delivered_at, state: delivered ? "done" : "todo" },
      ];

  return (
    <div>
      <div className="flex items-start">
        {steps.map((s, i) => (
          <div key={s.label} className={`flex items-start ${i > 0 ? "flex-1" : ""}`}>
            {i > 0 && (
              <div className={`flex-1 h-[2px] mt-[5px] mx-1.5 rounded-full min-w-6 ${s.state === "todo" ? "bg-[oklch(0.92_0.004_260)]" : DOT[s.state]}`} />
            )}
            <div className="flex flex-col items-center text-center w-max">
              <span className={`w-3 h-3 rounded-full ${DOT[s.state]}`} />
              <span className={`mt-1 text-[0.6875rem] font-semibold leading-tight whitespace-nowrap ${
                s.state === "bad" ? "text-[oklch(0.50_0.18_25)]" : s.state === "done" ? "text-[oklch(0.25_0.01_260)]" : "text-[oklch(0.65_0.01_260)]"
              }`}>
                {s.label}
              </span>
              <span className="text-[0.625rem] text-[oklch(0.60_0.01_260)] leading-tight whitespace-nowrap">{s.date ? fmtShort(s.date) : ""}</span>
            </div>
          </div>
        ))}
      </div>
      {cancelled && order.cancel_reason && (
        <p className="mt-2 text-[0.6875rem] text-[oklch(0.55_0.01_260)]">Reason: {order.cancel_reason}</p>
      )}
      {shipped && order.tracking_number && (
        <p className="mt-2 text-[0.75rem]">
          <a
            href={trackingUrl(order.carrier, order.tracking_number)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[oklch(0.40_0.16_260)] hover:underline"
          >
            Track package — {order.carrier || "USPS"} {order.tracking_number} →
          </a>
        </p>
      )}
    </div>
  );
}
