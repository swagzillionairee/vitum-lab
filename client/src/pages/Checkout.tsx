/*
 * Checkout.tsx — Vitum Lab dedicated checkout page (/checkout)
 * - Requires a signed-in customer (redirects to /login?redirect=/checkout).
 * - Left 2/3: contact + shipping address (Google Places autocomplete).
 * - Right 1/3: order summary (items, subtotal, discount, shipping, total),
 *   promo code, and the "Continue to Payment" button (NowPayments invoice).
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Tag, Check, Loader2, ShoppingBag, CreditCard, Bitcoin, Landmark, DollarSign, AtSign, Building2, Zap, ShieldCheck, CircleSlash, Lock, Truck, PartyPopper } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import { getPromoCode, clearPromoCode } from "@/lib/promo";
import { quantityDiscountPercent, round2, shippingFee, SHIPPING_PROTECTION_FEE, FREE_SHIPPING_THRESHOLD, FREE_GIFT_THRESHOLD, type QuantityTier } from "@/lib/discounts";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import SEO from "@/components/SEO";
import SquareCardBox from "@/components/SquareCardBox";
import ManualPaymentModal, { type ManualModalData } from "@/components/ManualPaymentModal";

interface Sitewide { active: boolean; percent?: number; label?: string | null; ends_at?: string | null }

function saleRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s` : `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
}

type PayMethod = "square" | "zelle" | "cashapp" | "venmo" | "ach" | "crypto";
const MANUAL_METHODS: PayMethod[] = ["zelle", "cashapp", "venmo", "ach"];

interface ManualCfg { enabled: boolean; handle: string; instructions: string }
interface PaymentsCfg {
  square: { enabled: boolean };
  zelle: ManualCfg; cashapp: ManualCfg; venmo: ManualCfg; ach: ManualCfg;
  crypto: { enabled: boolean };
}

// Display metadata per method (order = tile order). "memo" = where the customer
// writes their order number so we can match the transfer.
const METHOD_META: Record<PayMethod, { label: string; Icon: typeof CreditCard; memo: string }> = {
  square:  { label: "Card",        Icon: CreditCard, memo: "" },
  zelle:   { label: "Zelle",       Icon: Landmark,   memo: "memo / note" },
  cashapp: { label: "Cash App",    Icon: DollarSign, memo: "note" },
  venmo:   { label: "Venmo",       Icon: AtSign,     memo: "note" },
  ach:     { label: "Bank (ACH)",  Icon: Building2,  memo: "transfer memo" },
  crypto:  { label: "Crypto",      Icon: Bitcoin,    memo: "" },
};

// Per-method brand colour for the payment tiles. `icon` colours the glyph in
// both states (a pop of colour even when unselected); `sel` is the full selected
// treatment; `hover` tints an unselected tile on hover. Full class strings (incl.
// dark: variants) so Tailwind's scanner emits them.
const METHOD_STYLE: Record<PayMethod, { icon: string; sel: string; hover: string }> = {
  // Card → indigo/violet
  square: {
    icon: "text-[oklch(0.48_0.18_285)] dark:text-[oklch(0.80_0.14_285)]",
    sel: "border-[oklch(0.50_0.18_285)] bg-[oklch(0.96_0.03_285)] text-[oklch(0.36_0.17_285)] dark:bg-[oklch(0.30_0.10_285)] dark:text-[oklch(0.90_0.07_285)] dark:border-[oklch(0.55_0.15_285)]",
    hover: "hover:border-[oklch(0.70_0.10_285)] hover:bg-[oklch(0.985_0.01_285)] dark:hover:bg-[oklch(0.24_0.04_285)]",
  },
  // Zelle → purple
  zelle: {
    icon: "text-[oklch(0.48_0.20_300)] dark:text-[oklch(0.80_0.15_300)]",
    sel: "border-[oklch(0.50_0.20_300)] bg-[oklch(0.96_0.03_300)] text-[oklch(0.38_0.18_300)] dark:bg-[oklch(0.30_0.11_300)] dark:text-[oklch(0.90_0.11_300)] dark:border-[oklch(0.55_0.16_300)]",
    hover: "hover:border-[oklch(0.72_0.11_300)] hover:bg-[oklch(0.985_0.01_300)] dark:hover:bg-[oklch(0.24_0.04_300)]",
  },
  // Cash App → green
  cashapp: {
    icon: "text-[oklch(0.56_0.17_155)] dark:text-[oklch(0.80_0.16_155)]",
    sel: "border-[oklch(0.55_0.16_155)] bg-[oklch(0.95_0.05_155)] text-[oklch(0.40_0.14_155)] dark:bg-[oklch(0.28_0.10_155)] dark:text-[oklch(0.88_0.13_155)] dark:border-[oklch(0.55_0.15_155)]",
    hover: "hover:border-[oklch(0.72_0.12_155)] hover:bg-[oklch(0.98_0.02_155)] dark:hover:bg-[oklch(0.22_0.05_155)]",
  },
  // Venmo → blue
  venmo: {
    icon: "text-[oklch(0.54_0.16_245)] dark:text-[oklch(0.80_0.12_245)]",
    sel: "border-[oklch(0.52_0.16_245)] bg-[oklch(0.95_0.04_245)] text-[oklch(0.38_0.15_245)] dark:bg-[oklch(0.28_0.10_245)] dark:text-[oklch(0.88_0.11_245)] dark:border-[oklch(0.55_0.15_245)]",
    hover: "hover:border-[oklch(0.72_0.10_245)] hover:bg-[oklch(0.98_0.02_245)] dark:hover:bg-[oklch(0.22_0.05_245)]",
  },
  // Bank (ACH) → teal
  ach: {
    icon: "text-[oklch(0.52_0.11_195)] dark:text-[oklch(0.80_0.10_195)]",
    sel: "border-[oklch(0.52_0.12_195)] bg-[oklch(0.95_0.04_195)] text-[oklch(0.40_0.10_195)] dark:bg-[oklch(0.28_0.08_195)] dark:text-[oklch(0.86_0.10_195)] dark:border-[oklch(0.52_0.12_195)]",
    hover: "hover:border-[oklch(0.72_0.09_195)] hover:bg-[oklch(0.98_0.02_195)] dark:hover:bg-[oklch(0.22_0.04_195)]",
  },
  // Crypto → bitcoin orange
  crypto: {
    icon: "text-[oklch(0.64_0.16_55)] dark:text-[oklch(0.80_0.15_60)]",
    sel: "border-[oklch(0.62_0.16_55)] bg-[oklch(0.96_0.05_70)] text-[oklch(0.48_0.14_55)] dark:bg-[oklch(0.30_0.09_55)] dark:text-[oklch(0.86_0.13_65)] dark:border-[oklch(0.60_0.14_55)]",
    hover: "hover:border-[oklch(0.75_0.12_60)] hover:bg-[oklch(0.98_0.03_70)] dark:hover:bg-[oklch(0.24_0.05_55)]",
  },
};

// Trust row of accepted card brands — inline SVG/markup only (CSP-safe, no
// external images). White badges force an explicit white bg so the `.dark
// .bg-white` override doesn't darken them. Shown when Card (Square) is selected.
function CardBrands() {
  const chip = "inline-flex items-center justify-center h-6 rounded-[5px] bg-[oklch(1_0_0)] border border-[oklch(0.90_0.004_260)]";
  return (
    <div className="flex flex-col items-center gap-2 pt-1">
      <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-[oklch(0.50_0.01_260)] dark:text-[oklch(0.70_0.01_260)]">
        <Lock className="w-3 h-3" /> 256-bit SSL encrypted checkout
      </div>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <span className={`${chip} px-1.5`}><span className="text-[0.6875rem] font-extrabold italic tracking-tight text-[#1a1f71]">VISA</span></span>
        <span className={`${chip} w-10`}>
          <svg width="28" height="17" viewBox="0 0 28 17" aria-label="Mastercard" role="img">
            <circle cx="11" cy="8.5" r="6.5" fill="#EB001B" />
            <circle cx="17" cy="8.5" r="6.5" fill="#F79E1B" fillOpacity="0.85" />
          </svg>
        </span>
        <span className="inline-flex items-center justify-center h-6 px-1.5 rounded-[5px] bg-[#1F72CD]"><span className="text-[0.625rem] font-extrabold text-white tracking-tight">AMEX</span></span>
        <span className="inline-flex items-center justify-center gap-[3px] h-6 px-1.5 rounded-[5px] bg-black">
          <svg width="11" height="13" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.51 4.09l-.02-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
          <span className="text-[0.625rem] font-semibold text-white">Pay</span>
        </span>
        <span className={`${chip} px-1.5`}><span className="text-[0.6875rem] font-bold tracking-tight"><span className="text-[#4285F4]">G</span><span className="text-[#EA4335]"> </span><span className="text-[oklch(0.40_0.01_260)]">Pay</span></span></span>
      </div>
    </div>
  );
}

function isMethodEnabled(p: PaymentsCfg | null, m: PayMethod): boolean {
  if (!p) return false;
  if (m === "square") return !!p.square?.enabled;
  if (m === "crypto") return p.crypto?.enabled !== false;
  return !!p[m]?.enabled && !!p[m]?.handle;
}

export default function Checkout() {
  const { items, subtotal, openCart, clearCart } = useCart();
  const { session, user, loading } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [ship, setShip] = useState({
    name: "", line1: "", line2: "", city: "", state: "", postal_code: "", country: "US", phone: "",
  });
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountFlat, setDiscountFlat] = useState(0);
  const [affiliateId, setAffiliateId] = useState<string | undefined>();
  const [tiers, setTiers] = useState<QuantityTier[]>([]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [attested, setAttested] = useState(false);
  const [shippingProtection, setShippingProtection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Enabled payment methods (Square + manual handles + crypto), from the admin
  // config via /api/public/site. `payMethod` is the selected tile.
  const [payments, setPayments] = useState<PaymentsCfg | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("crypto");
  // Server config can offer Square while the client can't tokenize (missing
  // VITE_ vars, SDK blocked). Detect the config gap synchronously and SDK
  // failures via SquareCardBox.onUnavailable — then drop the Card tile instead
  // of showing a dead form.
  const [squareUnavailable, setSquareUnavailable] = useState(
    () => !import.meta.env.VITE_SQUARE_APPLICATION_ID || !import.meta.env.VITE_SQUARE_LOCATION_ID,
  );
  const [sale, setSale] = useState<Sitewide | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Post-order "send your payment" modal for the manual methods.
  const [modalData, setModalData] = useState<ManualModalData | null>(null);

  // Quantity tiers (display only) + payment method config + site-wide sale.
  // One auto-retry + a manual "Try again": a single failed fetch here used to
  // strand checkout with no payment methods — a silent dead end on the one
  // page that makes money.
  const [siteLoadFailed, setSiteLoadFailed] = useState(false);
  const [siteReloadKey, setSiteReloadKey] = useState(0);
  useEffect(() => {
    let stale = false;
    setSiteLoadFailed(false);
    const attempt = (retriesLeft: number) => {
      fetch("/api/public/site")
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then((d) => {
          if (stale) return;
          setTiers(d.quantity_tiers ?? []);
          setSale(d.sitewide ?? { active: false });
          const p = d.payments as PaymentsCfg | undefined;
          if (p) {
            setPayments(p);
            // Default to the first enabled method (Square first, crypto last) —
            // skipping Square when the client can't tokenize.
            const first = (["square", "zelle", "cashapp", "venmo", "ach", "crypto"] as PayMethod[])
              .find((m) => isMethodEnabled(p, m) && !(m === "square" && squareUnavailable));
            if (first) setPayMethod(first);
          }
        })
        .catch(() => {
          if (stale) return;
          if (retriesLeft > 0) setTimeout(() => { if (!stale) attempt(retriesLeft - 1); }, 1500);
          else setSiteLoadFailed(true);
        });
    };
    attempt(1);
    return () => { stale = true; };
  }, [siteReloadKey]);

  // Tick the sale countdown once a second while a sale with an end date runs.
  const saleEndsAt = sale?.ends_at ? new Date(sale.ends_at).getTime() : null;
  useEffect(() => {
    if (!sale?.active || !saleEndsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sale?.active, saleEndsAt]);

  // Store-credit balance (auto-applied at checkout; server is authoritative).
  useEffect(() => {
    if (!session) return;
    let stale = false;
    authedFetch("/api/account/credit")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !stale) setCreditBalance(Number(d.balance) || 0); })
      .catch(() => {});
    return () => { stale = true; };
  }, [session]);

  // Require sign-in; return here after auth. Preserve the full path + query so
  // any destination flags survive the login round-trip — a bare "/checkout"
  // would strip the query string.
  useEffect(() => {
    if (!loading && !session) {
      const here = window.location.pathname + window.location.search;
      navigate(`/login?redirect=${encodeURIComponent(here)}`);
    }
  }, [loading, session, navigate]);

  // Prefill email from the signed-in account.
  useEffect(() => {
    if (user?.email) setEmail((e) => e || user.email!);
  }, [user]);

  // Prefill the shipping address from the saved profile (or last order).
  useEffect(() => {
    if (!session) return;
    let stale = false;
    (async () => {
      try {
        const res = await authedFetch("/api/account/profile");
        if (!res.ok || stale) return;
        const { shipping_address: a } = await res.json();
        if (!a?.line1) return;
        setShip((prev) => (prev.line1 ? prev : {
          name: a.name ?? "", line1: a.line1 ?? "", line2: a.line2 ?? "", city: a.city ?? "",
          state: a.state ?? "", postal_code: a.postal_code ?? "", country: a.country || "US", phone: a.phone ?? "",
        }));
      } catch { /* prefill is best-effort */ }
    })();
    return () => { stale = true; };
  }, [session]);

  const setShipField = (field: keyof typeof ship, value: string) => {
    setShip((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const applyPromo = async (codeArg?: string) => {
    const code = (codeArg ?? promoCode).trim();
    if (!code) return;
    setPromoLoading(true);
    setPromoError("");
    setPromoApplied(false);
    try {
      const res = await authedFetch("/api/validate-discount", {
        method: "POST",
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setPromoError(data.error || "Invalid or expired promo code.");
      } else {
        setPromoApplied(true);
        setDiscountPct(data.discountPct ?? 0);
        setDiscountFlat(data.discountAmount ?? 0);
        setAffiliateId(data.affiliateId);
      }
    } catch {
      setPromoError("Couldn't validate that code. Please try again.");
    } finally {
      setPromoLoading(false);
    }
  };
  const handleApplyPromo = () => applyPromo();

  // Auto-apply a code shared via an affiliate/promo link (?code=…), once.
  useEffect(() => {
    if (items.length === 0 || promoApplied || promoLoading) return;
    const stored = getPromoCode();
    if (stored && !promoCode) {
      setPromoCode(stored);
      setPromoOpen(true);
      applyPromo(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Re-validate an applied code when the cart total changes (item added/removed
  // via the drawer): a min-subtotal promo that no longer qualifies must drop out
  // of the displayed total here, not surface as an opaque 400 at Pay.
  useEffect(() => {
    if (!promoApplied || promoLoading) return;
    applyPromo(promoCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  // Stacked discounts (mirror of the server): quantity tier first, then the
  // promo/affiliate % off the remainder. The server recomputes authoritatively.
  const units = items.filter((i) => !i.isFreeGift).reduce((sum, i) => sum + i.quantity, 0);
  const qtyPct = quantityDiscountPercent(tiers, units);
  const qtyDiscount = round2((subtotal * qtyPct) / 100);
  const afterQty = round2(subtotal - qtyDiscount);
  const codeDiscount = promoApplied
    ? (discountFlat > 0 ? round2(Math.min(discountFlat, afterQty)) : round2((afterQty * discountPct) / 100))
    : 0;
  const discountAmount = round2(qtyDiscount + codeDiscount);
  const netAfterDiscounts = round2(subtotal - discountAmount);
  // Flat $10 shipping under $75 (pre-discount basis), free above.
  const shippingCost = shippingFee(subtotal);
  // Optional lost/stolen shipping-protection add-on (flat fee). Server folds it
  // into shipping_amount, so it's part of the amount due (and credit can cover it).
  const protectionFee = shippingProtection ? SHIPPING_PROTECTION_FEE : 0;
  // Store credit auto-applies as tender (covering shipping too), reducing the
  // amount due (server is authoritative).
  const creditApplied = round2(Math.min(creditBalance, netAfterDiscounts + shippingCost + protectionFee));
  const total = round2(netAfterDiscounts + shippingCost + protectionFee - creditApplied);

  const handlePay = async (squareToken?: string) => {
    // Re-entrancy guard: a tokenize callback resolving while another payment
    // attempt is in flight (e.g. the user switched method mid-tokenize) must
    // never fire a second order-creating POST.
    if (busy) return;
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!ship.name.trim() || !ship.line1.trim() || !ship.city.trim() || !ship.state.trim() || !ship.postal_code.trim()) {
      setError("Please fill in your full shipping address.");
      return;
    }
    if (!attested) {
      setError("Please confirm the research-use acknowledgment to continue.");
      return;
    }
    setBusy(true);
    setError("");
    const shippingPayload = {
      name: ship.name.trim(), line1: ship.line1.trim(), line2: ship.line2.trim(),
      city: ship.city.trim(), state: ship.state.trim().toUpperCase(),
      postal_code: ship.postal_code.trim(), country: ship.country, phone: ship.phone.trim(),
    };
    try {
      const response = await authedFetch("/api/create-crypto-payment", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((i) => ({ name: i.name, dose: i.dose, quantity: i.quantity, cartCode: i.cartCode, price: i.price })),
          shipping: shippingPayload,
          total,
          discountCode: promoApplied ? promoCode : undefined,
          affiliateId: promoApplied ? affiliateId : undefined,
          discountAmount: promoApplied ? discountAmount : undefined,
          attestation: attested,
          shippingProtection,
          paymentMethod: total <= 0 ? "crypto" : payMethod,
          squareToken,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to create payment. Please try again.");
      } else {
        // Save the address for next time; keepalive lets it finish during the redirect.
        void authedFetch("/api/account/profile", {
          method: "PUT",
          body: JSON.stringify({ shipping_address: shippingPayload }),
          keepalive: true,
        }).catch(() => {});
        clearPromoCode(); // consumed — don't auto-apply on the next order
        if (data.free) {
          // $0 order (e.g. 100% promo) — already confirmed server-side.
          clearCart();
          navigate(`/order-success?order=${encodeURIComponent(data.orderId)}&free=1`);
        } else if (data.paid) {
          // Card charged + confirmed server-side (Square).
          clearCart();
          navigate(`/order-success?order=${encodeURIComponent(data.orderId)}`);
        } else if (data.awaiting) {
          // Manual transfer (Zelle/Cash App/Venmo/ACH) — the order is placed as
          // pending; open the "send your payment" modal with the real order # as
          // the reference. Do NOT clear the cart yet — the empty-cart screen would
          // replace the whole page (this component) and the modal with it. The
          // cart is cleared when the modal is dismissed, right before navigating.
          const cfg = payments?.[data.method as "venmo"] as ManualCfg | undefined;
          setModalData({
            method: data.method,
            handle: cfg?.handle ?? "",
            instructions: cfg?.instructions ?? "",
            amount: total.toFixed(2),
            orderId: data.orderId,
            expiresAt: data.expiresAt,
          });
        } else if (typeof data.invoiceUrl === "string" && data.invoiceUrl) {
          window.location.href = data.invoiceUrl; // NowPayments crypto redirect
        } else {
          // An OK response without an invoice URL must never navigate to
          // literal "undefined" — surface a retryable error instead.
          setError("We couldn't open the payment page. Please try again.");
        }
      }
    } catch {
      setError("Failed to create payment. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputBase = "border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent";
  const inputClass = `${inputBase} w-full`;
  const labelClass = "block text-[0.8125rem] font-semibold text-[oklch(0.35_0.01_260)] mb-1.5";

  // Enabled methods in tile order (Card drops out if the client can't tokenize).
  const enabledMethods = (["square", "zelle", "cashapp", "venmo", "ach", "crypto"] as PayMethod[])
    .filter((m) => isMethodEnabled(payments, m) && !(m === "square" && squareUnavailable));
  const saleActive = !!sale?.active && (!saleEndsAt || saleEndsAt > now);

  // If Square dies after being selected (SDK failed to load), fall over to the
  // next available method rather than leaving a selected tile that no longer exists.
  useEffect(() => {
    if (squareUnavailable && payMethod === "square") {
      const next = enabledMethods.find((m) => m !== "square");
      if (next) setPayMethod(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squareUnavailable, payMethod]);

  // The pay buttons are disabled until the research-use box is ticked — say why,
  // instead of showing a dead button (only the Card method had this hint before).
  const attestHint = !attested && (
    <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] text-center">
      Tick the research-use confirmation above to enable payment.
    </p>
  );

  if (loading || !session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" />
      </div>
    );
  }

  // Empty-cart screen — but NOT while the manual-payment modal is open (it renders
  // over this page; clearing the cart mustn't yank it away mid-instructions).
  if (items.length === 0 && !modalData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <SEO title="Checkout" description="Complete your Vitum Lab order." />
        <ShoppingBag className="w-12 h-12 text-[oklch(0.85_0.003_260)] mb-4" />
        <h1 className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Your cart is empty</h1>
        <button onClick={() => navigate("/shop")} className="mt-4 btn-primary py-2.5 px-6 text-sm">Browse Products</button>
      </div>
    );
  }

  return (
    <div className="container py-8 sm:py-10">
      <SEO title="Checkout" description="Complete your Vitum Lab order." />
      <h1 className="text-[1.75rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)] mb-6 sm:mb-8">Checkout</h1>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* ── Left 2/3: contact + shipping ─────────────────────────── */}
        <div className="lg:col-span-2 space-y-8">
          {/* Contact */}
          <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-4 sm:p-6">
            <h2 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)] mb-4">Contact</h2>
            <label className="block text-[0.8125rem] font-semibold text-[oklch(0.35_0.01_260)] mb-1.5">Email for order confirmation</label>
            <input type="email" value={email} readOnly aria-readonly className={`${inputClass} bg-[oklch(0.97_0.003_260)] text-[oklch(0.45_0.01_260)] cursor-not-allowed`} />
            <p className="mt-1.5 text-[0.6875rem] text-[oklch(0.55_0.01_260)]">Order updates go to your account email.</p>
          </section>

          {/* Shipping address */}
          <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-4 sm:p-6">
            <h2 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)] mb-4">Shipping address</h2>
            {/* Persistent labels (not placeholder-only): placeholders vanish on input,
                which hurts review-before-submit and screen-reader labeling. */}
            <div className="space-y-3">
              <label className="block">
                <span className={labelClass}>Full name</span>
                <input type="text" autoComplete="name" value={ship.name} onChange={(e) => setShipField("name", e.target.value)} placeholder="Full name" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Street address</span>
                <AddressAutocomplete
                  value={ship.line1}
                  onChange={(v) => setShipField("line1", v)}
                  onSelect={(p) => setShip((prev) => ({
                    ...prev,
                    line1: p.line1 || prev.line1,
                    city: p.city || prev.city,
                    state: p.state || prev.state,
                    postal_code: p.postal_code || prev.postal_code,
                    country: p.country || prev.country,
                  }))}
                  placeholder="Street address"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Apt, suite, unit <span className="font-normal">(optional)</span></span>
                <input type="text" autoComplete="address-line2" value={ship.line2} onChange={(e) => setShipField("line2", e.target.value)} placeholder="Apt, suite, unit (optional)" className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem]">
                <label className="col-span-2 block min-w-0 sm:col-span-1">
                  <span className={labelClass}>City</span>
                  <input type="text" autoComplete="address-level2" value={ship.city} onChange={(e) => setShipField("city", e.target.value)} placeholder="City" className={`${inputBase} w-full`} />
                </label>
                <label className="block min-w-0">
                  <span className={labelClass}>State</span>
                  <input type="text" autoComplete="address-level1" maxLength={2} value={ship.state} onChange={(e) => setShipField("state", e.target.value)} placeholder="State" className={`${inputBase} w-full`} />
                </label>
                <label className="block min-w-0">
                  <span className={labelClass}>ZIP</span>
                  <input type="text" autoComplete="postal-code" inputMode="numeric" value={ship.postal_code} onChange={(e) => setShipField("postal_code", e.target.value)} placeholder="ZIP" className={`${inputBase} w-full`} />
                </label>
              </div>
              <label className="block">
                <span className={labelClass}>Phone <span className="font-normal">(for delivery, optional)</span></span>
                <input type="tel" autoComplete="tel" value={ship.phone} onChange={(e) => setShipField("phone", e.target.value)} placeholder="Phone (for delivery, optional)" className={inputClass} />
              </label>
              <p className="text-[0.6875rem] text-[oklch(0.55_0.01_260)]">Ships within the United States only.</p>
            </div>
          </section>
        </div>

        {/* ── Right 1/3: order summary ─────────────────────────────── */}
        <div className="lg:col-span-1">
          {/* top-44 clears the full sticky header stack (marquee + compliance bar + nav ≈ 125px+) */}
          <div className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-4 sm:p-6 lg:sticky lg:top-44 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)]">Order summary</h2>
              <button onClick={openCart} className="inline-flex min-h-11 items-center px-1 text-[0.75rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">Edit cart</button>
            </div>

            {/* Two-stage nudge — free shipping at $75, then a free BAC Water at
                $100 (same logic as the cart drawer, so the story stays
                consistent at the highest-intent moment) */}
            {(() => {
              const freeShip = subtotal >= FREE_SHIPPING_THRESHOLD;
              const gift = subtotal >= FREE_GIFT_THRESHOLD;
              const target = freeShip ? FREE_GIFT_THRESHOLD : FREE_SHIPPING_THRESHOLD;
              const remaining = round2(Math.max(0, target - subtotal));
              const pct = Math.min(100, Math.round((subtotal / target) * 100));
              return (
                <div className="rounded-xl border border-[oklch(0.90_0.05_155)] dark:border-[oklch(0.30_0.06_155)] bg-[oklch(0.97_0.03_155)] dark:bg-[oklch(0.20_0.05_155)] px-3.5 py-3">
                  <div className="flex items-center gap-1.5 text-[0.75rem] font-bold text-[oklch(0.42_0.13_155)] dark:text-[oklch(0.82_0.14_155)] mb-2">
                    {gift
                      ? (<><PartyPopper className="w-3.5 h-3.5" /> Free shipping + free BAC Water unlocked!</>)
                      : freeShip
                        ? (<><PartyPopper className="w-3.5 h-3.5" /> Free shipping unlocked — ${remaining.toFixed(2)} more adds a free BAC Water</>)
                        : (<><Truck className="w-3.5 h-3.5" /> ${remaining.toFixed(2)} away from free shipping</>)}
                  </div>
                  <div className="h-1.5 rounded-full bg-[oklch(0.90_0.02_155)] dark:bg-[oklch(0.28_0.03_155)] overflow-hidden">
                    <div className="h-full rounded-full bg-[oklch(0.55_0.15_155)] transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}

            {/* Items */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "#f0f0f0" }}>
                    <img src={item.img} alt={`${item.name} ${item.dose}`} loading="lazy" decoding="async" className="w-full h-full object-cover object-top" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] leading-tight truncate">{item.name}</p>
                    <p className="text-[0.8125rem] text-[oklch(0.42_0.01_260)] mt-0.5">{item.dose} · <span className="font-semibold text-[oklch(0.20_0.01_260)]">Qty {item.quantity}</span></p>
                  </div>
                  <span className="text-[0.8125rem] font-bold text-[oklch(0.13_0.01_260)]">
                    {item.price === 0 ? "Free" : `$${(item.price * item.quantity).toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Promo */}
            <div className="border-t border-[oklch(0.93_0.004_260)] pt-4">
              <button onClick={() => setPromoOpen(!promoOpen)} aria-expanded={promoOpen} aria-controls="promo-entry" className="flex min-h-11 items-center gap-1.5 text-[0.8125rem] text-[oklch(0.40_0.16_260)] font-semibold hover:underline">
                <Tag className="w-3.5 h-3.5" /> Have a promo code?
              </button>
              {promoOpen && (
                <div id="promo-entry" className="mt-2 flex gap-2">
                  <input type="text" value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPromoError(""); setPromoApplied(false); setDiscountPct(0); setDiscountFlat(0); setAffiliateId(undefined); }} placeholder="Enter code" className={`${inputBase} flex-1 min-w-0 py-2`} />
                  <button onClick={handleApplyPromo} disabled={promoLoading} className="min-h-11 flex-shrink-0 px-4 py-2 rounded-full bg-[oklch(0.13_0.02_260)] text-white text-[0.8125rem] font-semibold hover:bg-[oklch(0.22_0.02_260)] transition-colors disabled:opacity-60">
                    {promoLoading ? "…" : "Apply"}
                  </button>
                </div>
              )}
              {promoApplied && <p className="mt-1.5 text-[0.75rem] text-[oklch(0.35_0.14_155)] flex items-center gap-1"><Check className="w-3 h-3" /> Promo code applied!</p>}
              {promoError && <p className="mt-1.5 text-[0.75rem] text-red-600">{promoError}</p>}
            </div>

            {/* Totals */}
            <div className="border-t border-[oklch(0.93_0.004_260)] pt-4 space-y-2">
              <div className="flex justify-between text-[0.875rem] text-[oklch(0.40_0.01_260)]">
                <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
              </div>
              {qtyDiscount > 0 && (
                <div className="flex justify-between text-[0.875rem] text-[oklch(0.35_0.14_155)] font-semibold">
                  <span>Quantity discount ({qtyPct}% · {units} items)</span><span>−${qtyDiscount.toFixed(2)}</span>
                </div>
              )}
              {codeDiscount > 0 && (
                <div className="flex justify-between text-[0.875rem] text-[oklch(0.35_0.14_155)] font-semibold">
                  <span>{discountFlat > 0 ? "Referral discount" : `Promo (${discountPct}%)`}</span><span>−${codeDiscount.toFixed(2)}</span>
                </div>
              )}
              {creditApplied > 0 && (
                <div className="flex justify-between text-[0.875rem] text-[oklch(0.35_0.14_155)] font-semibold">
                  <span>Store credit</span><span>−${creditApplied.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-[0.875rem] text-[oklch(0.40_0.01_260)]">
                <span>Shipping</span>
                {shippingCost > 0 ? (
                  <span>${shippingCost.toFixed(2)}</span>
                ) : (
                  <span className="text-[oklch(0.35_0.12_155)] font-semibold">Free</span>
                )}
              </div>
              {protectionFee > 0 && (
                <div className="flex justify-between text-[0.875rem] text-[oklch(0.40_0.01_260)]">
                  <span>Shipping protection</span><span>${protectionFee.toFixed(2)}</span>
                </div>
              )}
              <p className="text-[0.6875rem] text-[oklch(0.55_0.01_260)] leading-snug">
                Free shipping on orders of $75+, based on your subtotal before discounts.
              </p>
              <div className="flex justify-between items-center border-t border-[oklch(0.93_0.004_260)] pt-2">
                <span className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)]">Total</span>
                <span className="text-[1.35rem] font-extrabold text-[oklch(0.45_0.17_265)] dark:text-[oklch(0.78_0.15_265)]">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Optional Shipping Protection add-on */}
            <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${
              shippingProtection
                ? "border-[oklch(0.55_0.12_195)] bg-[oklch(0.96_0.03_195)] dark:bg-[oklch(0.22_0.06_195)] dark:border-[oklch(0.50_0.12_195)]"
                : "border-[oklch(0.90_0.004_260)] hover:bg-[oklch(0.98_0.015_195)] dark:hover:bg-[oklch(0.20_0.02_260)]"
            }`}>
              <input
                type="checkbox"
                checked={shippingProtection}
                onChange={(e) => setShippingProtection(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-[oklch(0.50_0.12_195)] flex-shrink-0"
              />
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-[oklch(0.28_0.05_200)] dark:text-[oklch(0.88_0.07_200)]">
                    <ShieldCheck className="w-4 h-4 text-[oklch(0.50_0.12_195)] dark:text-[oklch(0.78_0.10_195)]" /> Shipping Protection
                  </span>
                  <span className="text-[0.8125rem] font-bold text-[oklch(0.42_0.11_195)] dark:text-[oklch(0.82_0.10_195)] whitespace-nowrap">+${SHIPPING_PROTECTION_FEE.toFixed(2)}</span>
                </span>
                <span className="block mt-1 text-[0.6875rem] text-[oklch(0.50_0.01_260)] leading-relaxed">
                  If your package is lost or stolen, we'll send a free replacement — no questions asked.
                </span>
              </span>
            </label>

            {/* Research-use / age attestation — required to place an order */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => { setAttested(e.target.checked); setError(""); }}
                className="mt-0.5 w-4 h-4 rounded border-[oklch(0.80_0.01_260)] accent-[oklch(0.40_0.16_260)] flex-shrink-0"
              />
              <span className="text-[0.6875rem] text-[oklch(0.45_0.01_260)] leading-relaxed">
                I confirm I am at least 21 years old and a qualified researcher, and that these products are purchased strictly for <span className="font-semibold">laboratory / in-vitro research use only</span> — not for human or veterinary consumption.
              </span>
            </label>

            {total <= 0 ? (
              <div className="space-y-3">
                <button onClick={() => handlePay()} disabled={busy || !attested} className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem] disabled:opacity-60 disabled:cursor-not-allowed">
                  {busy ? "Processing…" : (<>Place Order <ArrowRight className="w-4 h-4" /></>)}
                </button>
                {attestHint}
                {error && <p role="alert" className="text-[0.8125rem] font-semibold text-red-600 dark:text-red-400">{error}</p>}
              </div>
            ) : enabledMethods.length === 0 ? (
              <div className="text-center py-2 space-y-2.5">
                <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
                  {siteLoadFailed ? "We couldn't load the payment options — check your connection." : "No payment methods are available right now."}{" "}
                  Need help? <a href="mailto:hello@vitumlab.com" className="text-[oklch(0.40_0.16_260)] font-semibold hover:underline">hello@vitumlab.com</a>
                </p>
                {siteLoadFailed && (
                  <button onClick={() => setSiteReloadKey((k) => k + 1)} className="btn-secondary text-[0.8125rem] py-2 px-6">
                    Try again
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Site-wide sale — "prices locked in" reassurance + countdown */}
                {saleActive && (
                  <div className="rounded-xl border border-[oklch(0.85_0.06_240)] bg-[oklch(0.97_0.02_240)] px-4 py-3 flex items-center gap-3">
                    <span className="text-[1.25rem]">☀️</span>
                    <div>
                      <p className="text-[0.875rem] font-bold text-[oklch(0.40_0.14_250)]">Sale prices locked in</p>
                      {saleEndsAt && <p className="text-[0.75rem] text-[oklch(0.50_0.02_250)]">Ends in <span className="font-bold tabular-nums">{saleRemaining(saleEndsAt - now)}</span></p>}
                    </div>
                  </div>
                )}

                {/* Phones keep two comfortably tappable columns; larger screens
                    retain the compact, balanced 3/4-column layout. */}
                <div className={`grid gap-2 ${enabledMethods.length === 1 ? "grid-cols-1" : enabledMethods.length === 2 ? "grid-cols-2" : enabledMethods.length === 3 ? "grid-cols-2 sm:grid-cols-3" : enabledMethods.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
                  {enabledMethods.map((m) => {
                    const { label, Icon } = METHOD_META[m];
                    const st = METHOD_STYLE[m];
                    const selected = payMethod === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={busy}
                        aria-pressed={selected}
                        onClick={() => { setPayMethod(m); setError(""); }}
                        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 py-3 px-1 min-h-[70px] text-[0.8125rem] font-semibold transition-colors disabled:opacity-60 ${
                          selected
                            ? st.sel
                            : `border-[oklch(0.90_0.004_260)] text-[oklch(0.35_0.01_260)] dark:border-[oklch(0.30_0.01_260)] dark:text-[oklch(0.72_0.01_260)] ${st.hover}`
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${st.icon}`} /> {label}
                        {m === "ach" && <span className="text-[0.5625rem] font-medium text-[oklch(0.45_0.12_155)] leading-none">No card fees</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Square — inline secure card fields + accepted-card trust row */}
                {payMethod === "square" && (
                  <div className="space-y-3">
                    {attested ? (
                      <SquareCardBox amountDue={total} disabled={busy || !attested} busy={busy} onPay={(t) => handlePay(t)} onError={setError} onUnavailable={() => setSquareUnavailable(true)} />
                    ) : (
                      <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] text-center py-2">Confirm the acknowledgment above to enter your card.</p>
                    )}
                    <CardBrands />
                  </div>
                )}

                {/* Bank / ACH — trust badges + how-it-works, then place the order */}
                {payMethod === "ach" && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { Icon: Landmark, text: "Direct Bank Transfer" },
                        { Icon: Zap, text: "Same-Day Clearing" },
                        { Icon: ShieldCheck, text: "Bank-Level Security" },
                        { Icon: CircleSlash, text: "No Card Fees" },
                      ].map((b) => (
                        <span key={b.text} className="flex items-center gap-1.5 rounded-lg border border-[oklch(0.85_0.06_155)] bg-[oklch(0.98_0.02_155)] px-2.5 py-1.5 text-[0.75rem] font-semibold text-[oklch(0.40_0.12_155)]">
                          <b.Icon className="w-3.5 h-3.5 flex-shrink-0" /> {b.text}
                        </span>
                      ))}
                    </div>
                    <button onClick={() => handlePay()} disabled={busy || !attested} className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-white text-[0.9375rem] font-bold bg-[oklch(0.42_0.13_155)] hover:bg-[oklch(0.37_0.13_155)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                      {busy ? "Placing order…" : (<><Building2 className="w-4 h-4" /> Pay with Bank</>)}
                    </button>
                    {attestHint}
                    <div className="rounded-xl border border-[oklch(0.88_0.05_155)] bg-[oklch(0.98_0.02_155)] px-4 py-3 text-[0.75rem] text-[oklch(0.38_0.10_155)] leading-relaxed">
                      <span className="font-bold">How it works:</span> Place your order, then send the bank transfer to the details we provide — include your order number in the memo. Use a US checking account with available funds. We confirm and ship as soon as it clears.
                    </div>
                  </div>
                )}

                {/* Manual wallets (Venmo / Cash App / Zelle) — place order → modal */}
                {MANUAL_METHODS.includes(payMethod) && payMethod !== "ach" && (
                  <>
                    <button onClick={() => handlePay()} disabled={busy || !attested} className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem] disabled:opacity-60 disabled:cursor-not-allowed">
                      {busy ? "Placing order…" : (<>Pay with {METHOD_META[payMethod].label} <ArrowRight className="w-4 h-4" /></>)}
                    </button>
                    {attestHint}
                  </>
                )}

                {/* Crypto — redirect to the NowPayments invoice */}
                {payMethod === "crypto" && (
                  <>
                    <button onClick={() => handlePay()} disabled={busy || !attested} className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem] disabled:opacity-60 disabled:cursor-not-allowed">
                      {busy ? "Processing…" : (<>Continue with crypto <ArrowRight className="w-4 h-4" /></>)}
                    </button>
                    {attestHint}
                  </>
                )}

                {/* Errors render HERE — directly under whichever pay button is
                    visible. The old placement was far above the payment area,
                    so a card decline scrolled out of view and buyers never
                    learned why the charge failed (or that they could retry). */}
                {error && <p role="alert" className="text-[0.8125rem] font-semibold text-red-600 dark:text-red-400">{error}</p>}
              </div>
            )}
            {/* Pastel trust chips */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.625rem] font-bold bg-[oklch(0.96_0.03_155)] text-[oklch(0.42_0.13_155)] dark:bg-[oklch(0.22_0.05_155)] dark:text-[oklch(0.82_0.13_155)]">
                <ShieldCheck className="w-3 h-3" /> ≥99% Purity
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.625rem] font-bold bg-[oklch(0.96_0.03_245)] text-[oklch(0.42_0.14_245)] dark:bg-[oklch(0.22_0.05_245)] dark:text-[oklch(0.82_0.12_245)]">
                <Truck className="w-3 h-3" /> USPS 2–5 days
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.625rem] font-bold bg-[oklch(0.96_0.03_290)] text-[oklch(0.44_0.15_290)] dark:bg-[oklch(0.24_0.06_290)] dark:text-[oklch(0.84_0.13_290)]">
                <Check className="w-3 h-3" /> COA included
              </span>
            </div>

            <p className="text-[0.625rem] text-center text-[oklch(0.70_0.01_260)]">
              Research use only — not for human consumption.
            </p>
          </div>
        </div>
      </div>

      {/* "Send your payment" modal — appears after a manual order is placed.
          Dismissing it (either button) clears the now-placed cart and takes the
          customer to the success page, which repeats the payment instructions. */}
      {modalData && (() => {
        const go = (d: ManualModalData) => {
          clearCart();
          const exp = d.expiresAt ? `&exp=${encodeURIComponent(d.expiresAt)}` : "";
          navigate(`/order-success?order=${encodeURIComponent(d.orderId)}&awaiting=1&method=${encodeURIComponent(d.method)}&amt=${d.amount}${exp}`);
        };
        const onSent = () => {
          const d = modalData;
          // Tell the payment inbox to verify this transfer (fire-and-forget;
          // keepalive lets it finish through the navigation).
          void authedFetch("/api/account/payment-sent", {
            method: "POST",
            body: JSON.stringify({ orderId: d.orderId }),
            keepalive: true,
          }).catch(() => {});
          go(d);
        };
        return <ManualPaymentModal data={modalData} onSent={onSent} onClose={() => go(modalData)} />;
      })()}
    </div>
  );
}
