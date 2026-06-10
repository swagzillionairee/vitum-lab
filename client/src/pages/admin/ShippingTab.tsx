/*
 * ShippingTab.tsx — all orders with a tracking number, with a bulk "copy all
 * tracking numbers" action for USPS (the email/order labels are select-none so
 * they're excluded from the copy).
 */

import { useState, useEffect, useCallback } from "react";
import { Truck, Loader2, Check, Upload } from "lucide-react";
import { authedFetch } from "@/lib/api";
import type { ShipmentRow } from "./types";

export default function ShippingTab() {
  const [shipments, setShipments] = useState<ShipmentRow[] | null>(null);
  const [hideDelivered, setHideDelivered] = useState(true);
  const [copiedAllTracking, setCopiedAllTracking] = useState(false);

  const loadShipments = useCallback(async () => {
    const res = await authedFetch("/api/admin/shipments");
    if (res.ok) setShipments((await res.json()).shipments ?? []);
  }, []);

  useEffect(() => { loadShipments(); }, [loadShipments]);

  const visibleShipments = (shipments ?? []).filter((s) => s.tracking_number && (!hideDelivered || s.fulfillment_status !== "delivered"));

  const copyAllTracking = () => {
    const numbers = visibleShipments.map((s) => s.tracking_number).filter(Boolean) as string[];
    if (numbers.length === 0) return;
    // USPS bulk tracking accepts up to 35 numbers separated by commas.
    navigator.clipboard.writeText(numbers.join(","));
    setCopiedAllTracking(true);
    setTimeout(() => setCopiedAllTracking(false), 2000);
  };

  return (
    <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Shipping &amp; Tracking</h2>
          {shipments && <span className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">({visibleShipments.length})</span>}
        </div>
        <button
          onClick={copyAllTracking}
          disabled={visibleShipments.length === 0}
          className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-white bg-[oklch(0.40_0.16_260)] px-4 py-2 rounded-lg hover:bg-[oklch(0.35_0.16_260)] disabled:opacity-40"
        >
          {copiedAllTracking ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
          {copiedAllTracking ? "Copied!" : `Copy all ${visibleShipments.length} tracking #s`}
        </button>
      </div>
      <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-1">
        "Copy all" puts just the tracking numbers (comma-separated) on your clipboard — the email/order on the left is not included.
        Paste into <a href="https://tools.usps.com/go/TrackConfirmAction_input" target="_blank" rel="noopener noreferrer" className="text-[oklch(0.40_0.16_260)] font-semibold hover:underline">USPS Tracking</a> (up to 35 at a time).
      </p>

      <label className="inline-flex items-center gap-2 text-[0.8125rem] text-[oklch(0.40_0.01_260)] my-4 cursor-pointer">
        <input type="checkbox" checked={hideDelivered} onChange={(e) => setHideDelivered(e.target.checked)} className="accent-[oklch(0.40_0.16_260)]" />
        Hide delivered (track only in-transit)
      </label>

      {shipments === null ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
      ) : visibleShipments.length === 0 ? (
        <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">{hideDelivered ? "No in-transit shipments. Toggle off “Hide delivered” to see delivered ones." : "No orders with tracking numbers yet."}</p>
      ) : (
        <ul className="divide-y divide-[oklch(0.95_0.003_260)] border-y border-[oklch(0.95_0.003_260)]">
          {visibleShipments.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 py-2.5">
              {/* Left label — not part of the bulk copy (select-none) */}
              <span className="select-none flex items-center gap-2 text-[0.75rem] text-[oklch(0.52_0.01_260)] min-w-0">
                <span className="truncate max-w-[220px]">{s.email}</span>
                <span className="font-mono text-[oklch(0.60_0.01_260)]">#{s.id.slice(0, 10)}</span>
                {s.fulfillment_status === "delivered" && (
                  <span className="select-none px-2 py-0.5 rounded-full text-[0.625rem] font-semibold bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]">delivered</span>
                )}
              </span>
              {/* Tracking number — the only selectable/copyable text */}
              <span className="flex items-center gap-2 whitespace-nowrap">
                <span className="select-none text-[0.6875rem] text-[oklch(0.60_0.01_260)]">{s.carrier || "USPS"}</span>
                <span className="font-mono text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)]">{s.tracking_number}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
