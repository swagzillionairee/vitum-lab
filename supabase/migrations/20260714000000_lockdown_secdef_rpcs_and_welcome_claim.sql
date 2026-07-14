-- Security hardening (July 2026 audit follow-up). Applied to the live project
-- (mddgtvwcwsmlbwiafdvq) via the Supabase MCP; recorded here for traceability.
--
-- 1) Lock down SECURITY DEFINER RPCs that were left executable by the public
--    anon / authenticated roles. The 20260706020000 batch created
--    decrement_promo_use and stamp_email as SECURITY DEFINER but omitted the
--    REVOKE that every other server-only RPC pairs with its CREATE, so the
--    default PUBLIC EXECUTE grant stood. With the anon key (shipped in the client
--    bundle) anyone could call them via PostgREST /rest/v1/rpc/*:
--      • decrement_promo_use → floor a promo's global used_count to 0, defeating
--        its max_uses cap (dilutes a limited-quantity discount).
--      • stamp_email → write orders.emails_sent on ANY order id, suppressing that
--        order's confirmation / shipping / admin-alert emails.
--    expire_stale_orders() (created out-of-band for pg_cron) had the same gap and
--    let anyone trigger the expiry sweep. All three are only ever invoked by the
--    service-role server; SECURITY DEFINER runs as the owner (bypassing RLS)
--    regardless, and the pg_cron scheduled job runs as its owner, not anon — so
--    revoking anon/authenticated EXECUTE breaks nothing.
revoke execute on function public.decrement_promo_use(text)  from public, anon, authenticated;
grant  execute on function public.decrement_promo_use(text)  to service_role;

revoke execute on function public.stamp_email(text, text)    from public, anon, authenticated;
grant  execute on function public.stamp_email(text, text)    to service_role;

revoke execute on function public.expire_stale_orders()      from public, anon, authenticated;
grant  execute on function public.expire_stale_orders()      to service_role;

-- 2) Atomic welcome-email dedupe. /api/me deduped the one-time welcome email via
--    a read-modify-write on the auth user's `welcomed` metadata flag, which raced
--    when the client fired several /api/me calls at once (each saw the flag unset
--    and sent a duplicate). A single-row-per-email claim table lets exactly one
--    concurrent caller win via the primary key; the loser's INSERT 23505s and it
--    skips the send. Service-role only (RLS on, zero policies = deny-all to anon /
--    authenticated, like orders / store_credit_ledger / discount_redemptions).
create table if not exists public.welcome_sent (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.welcome_sent enable row level security;
