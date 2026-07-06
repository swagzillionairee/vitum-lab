/*
 * PaymentsTab.tsx — configure the checkout's payment methods.
 * Square (live cards, credentials via Vercel env) + manual peer-to-peer methods
 * (Zelle / Cash App / Venmo / bank ACH, admin-verified) + crypto (NowPayments).
 * Manual handles are shown to customers at checkout, so they're saved to
 * store_settings.payment_config via /api/admin/payment-config.
 */
import { useState, useEffect, useCallback } from "react";
import { CreditCard, Loader2, Check, Wallet } from "lucide-react";
import { authedFetch } from "@/lib/api";

interface ManualCfg { enabled: boolean; handle: string; instructions: string }
interface Config {
  square: { enabled: boolean };
  zelle: ManualCfg; cashapp: ManualCfg; venmo: ManualCfg; ach: ManualCfg;
  crypto: { enabled: boolean };
}

const MANUAL: { key: "zelle" | "cashapp" | "venmo" | "ach"; label: string; placeholder: string }[] = [
  { key: "zelle", label: "Zelle", placeholder: "email or phone number linked to Zelle" },
  { key: "cashapp", label: "Cash App", placeholder: "$cashtag" },
  { key: "venmo", label: "Venmo", placeholder: "@username" },
  { key: "ach", label: "Bank (ACH)", placeholder: "Bank name, routing #, account # (multi-line ok)" },
];

const EMPTY_MANUAL: ManualCfg = { enabled: false, handle: "", instructions: "" };

export default function PaymentsTab() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [squareConfigured, setSquareConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/payment-config");
    if (res.ok) {
      const d = await res.json();
      const p = d.payment_config ?? {};
      setCfg({
        square: { enabled: !!p.square?.enabled },
        zelle: { ...EMPTY_MANUAL, ...p.zelle },
        cashapp: { ...EMPTY_MANUAL, ...p.cashapp },
        venmo: { ...EMPTY_MANUAL, ...p.venmo },
        ach: { ...EMPTY_MANUAL, ...p.ach },
        crypto: { enabled: p.crypto?.enabled !== false },
      });
      setSquareConfigured(!!d.square_configured);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true); setErr(""); setMsg("");
    const res = await authedFetch("/api/admin/payment-config", {
      method: "PUT",
      body: JSON.stringify({ payment_config: cfg }),
    });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to save"); return; }
    setMsg("Payment methods saved.");
  };

  const setManual = (key: "zelle" | "cashapp" | "venmo" | "ach", patch: Partial<ManualCfg>) =>
    setCfg((c) => c && { ...c, [key]: { ...c[key], ...patch } });

  if (!cfg) {
    return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>;
  }

  return (
    <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
        <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Payment Methods</h2>
      </div>
      <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] -mt-3">
        Turn methods on and set the handle customers send to. Manual transfers (Zelle / Cash App / Venmo / ACH) create an
        order marked <span className="font-semibold">Awaiting payment</span> — verify it landed, then hit <span className="font-semibold">Mark paid</span> in Orders.
      </p>

      {/* Square (live cards) */}
      <div className="rounded-xl border border-[oklch(0.92_0.004_260)] p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 font-semibold text-[oklch(0.20_0.01_260)]"><CreditCard className="w-4 h-4" /> Card (Square)</span>
          <input type="checkbox" checked={cfg.square.enabled} onChange={(e) => setCfg({ ...cfg, square: { enabled: e.target.checked } })} className="w-4 h-4 accent-[oklch(0.40_0.16_260)]" />
        </label>
        <p className={`text-[0.75rem] mt-2 ${squareConfigured ? "text-[oklch(0.40_0.10_155)]" : "text-[oklch(0.55_0.12_50)]"}`}>
          {squareConfigured
            ? "✓ Square credentials detected. Cards charge live once enabled."
            : "⚠️ Add SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID + SQUARE_ENVIRONMENT (and the VITE_SQUARE_* build vars) in Vercel — the card option stays hidden from customers until they're set, even if enabled here."}
        </p>
      </div>

      {/* Manual P2P methods */}
      {MANUAL.map(({ key, label, placeholder }) => (
        <div key={key} className="rounded-xl border border-[oklch(0.92_0.004_260)] p-4 space-y-2.5">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="font-semibold text-[oklch(0.20_0.01_260)]">{label}</span>
            <input type="checkbox" checked={cfg[key].enabled} onChange={(e) => setManual(key, { enabled: e.target.checked })} className="w-4 h-4 accent-[oklch(0.40_0.16_260)]" />
          </label>
          <input
            value={cfg[key].handle}
            onChange={(e) => setManual(key, { handle: e.target.value })}
            placeholder={placeholder}
            className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
          />
          <textarea
            value={cfg[key].instructions}
            onChange={(e) => setManual(key, { instructions: e.target.value })}
            placeholder="Optional extra instructions shown to the customer (e.g. 'Send as Friends & Family')"
            rows={2}
            className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
          />
          {cfg[key].enabled && !cfg[key].handle.trim() && (
            <p className="text-[0.75rem] text-[oklch(0.55_0.12_50)]">Add a handle — the method stays hidden from customers until it's set.</p>
          )}
        </div>
      ))}

      {/* Crypto */}
      <div className="rounded-xl border border-[oklch(0.92_0.004_260)] p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="font-semibold text-[oklch(0.20_0.01_260)]">Crypto (NowPayments)</span>
          <input type="checkbox" checked={cfg.crypto.enabled} onChange={(e) => setCfg({ ...cfg, crypto: { enabled: e.target.checked } })} className="w-4 h-4 accent-[oklch(0.40_0.16_260)]" />
        </label>
        <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] mt-2">Automated crypto checkout — confirms itself via the payment webhook.</p>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-5 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
        </button>
        {msg && <span className="text-[0.8125rem] text-[oklch(0.35_0.14_155)] flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {msg}</span>}
        {err && <span className="text-[0.8125rem] text-red-500">{err}</span>}
      </div>
    </section>
  );
}
