/*
 * credit.ts — store credit ledger + loyalty + referral rewards.
 * Balance is DERIVED via the store_credit_balance RPC (redemptions on
 * cancelled/failed orders are excluded, so a dead order's credit is auto-refunded
 * with no extra writes). All earns/redemptions/rewards are idempotent per
 * (order_id, reason).
 */
import { supabaseAdmin } from "./supabase-admin.js";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface RewardConfig {
  loyaltyPercent: number;
  refereeAmount: number;
  referrerAmount: number;
  referralMinSubtotal: number;
}

export async function getRewardConfig(): Promise<RewardConfig> {
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("loyalty_percent, referral_referee_amount, referral_referrer_amount, referral_min_subtotal")
    .maybeSingle();
  return {
    loyaltyPercent: Number(data?.loyalty_percent ?? 0),
    refereeAmount: Number(data?.referral_referee_amount ?? 0),
    referrerAmount: Number(data?.referral_referrer_amount ?? 0),
    referralMinSubtotal: Number(data?.referral_min_subtotal ?? 0),
  };
}

/** Current spendable store credit for an email (≥ 0). */
export async function getBalance(email: string): Promise<number> {
  if (!email) return 0;
  const { data, error } = await supabaseAdmin.rpc("store_credit_balance", { p_email: email });
  if (error) { console.error("store_credit_balance error:", error); return 0; }
  return Math.max(0, round2(Number(data) || 0));
}

/** Idempotent ledger insert keyed by (order_id, reason). Returns true if inserted. */
export async function addLedger(entry: { email: string; amount: number; reason: string; orderId?: string | null }): Promise<boolean> {
  const amount = round2(entry.amount);
  if (!entry.email || amount === 0) return false;
  const { error } = await supabaseAdmin.from("store_credit_ledger").insert({
    email: entry.email,
    amount,
    reason: entry.reason,
    order_id: entry.orderId ?? null,
  });
  if (error) {
    if ((error as { code?: string }).code !== "23505") console.error("addLedger error:", error); // 23505 = already recorded
    return false;
  }
  return true;
}

/** Reserve (redeem) credit for an order at creation — a negative ledger entry. */
export async function reserveCredit(email: string, amount: number, orderId: string): Promise<void> {
  if (!(amount > 0)) return;
  await addLedger({ email, amount: -round2(amount), reason: "redemption", orderId });
}

/** Earn loyalty on confirmation. Base = cash actually paid (net − credit applied). */
export async function earnLoyalty(
  order: { id: string; email: string; net_amount: number | string; credit_applied?: number | string | null },
  percent: number,
): Promise<void> {
  if (!(percent > 0)) return;
  const cashPaid = round2((Number(order.net_amount) || 0) - (Number(order.credit_applied) || 0));
  if (cashPaid <= 0) return;
  await addLedger({ email: order.email, amount: round2((cashPaid * percent) / 100), reason: "loyalty", orderId: order.id });
}

/** Grant the referrer their store credit on the referee's first paid order. */
export async function grantReferralReward(
  order: { id: string; email: string; referral_code?: string | null },
  amount: number,
): Promise<void> {
  if (!order.referral_code || !(amount > 0)) return;
  const { data: ref } = await supabaseAdmin.from("referral_codes").select("email").eq("code", order.referral_code).maybeSingle();
  const referrer = ref?.email;
  if (!referrer || referrer.toLowerCase() === (order.email || "").toLowerCase()) return; // no self-referral
  await addLedger({ email: referrer, amount: round2(amount), reason: "referral", orderId: order.id });
}

/** Resolve (or lazily create) a customer's referral code. */
export async function getOrCreateReferralCode(email: string): Promise<string> {
  const find = async () =>
    (await supabaseAdmin.from("referral_codes").select("code").eq("email", email).maybeSingle()).data?.code as string | undefined;

  const existing = await find();
  if (existing) return existing;

  const base = (email.split("@")[0] || "ref").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() || "REF";
  for (let i = 0; i < 5; i++) {
    const code = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await supabaseAdmin.from("referral_codes").insert({ code, email });
    if (!error) return code;
    const after = await find(); // a concurrent request may have created it (email is unique)
    if (after) return after;
  }
  const fallback = `REF${Date.now().toString(36).toUpperCase()}`;
  await supabaseAdmin.from("referral_codes").insert({ code: fallback, email }).then(() => {}, () => {});
  return (await find()) ?? fallback;
}
