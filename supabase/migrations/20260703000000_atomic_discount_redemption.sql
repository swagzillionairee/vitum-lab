-- Applied to the live project (mddgtvwcwsmlbwiafdvq) on 2026-07-03 via the
-- Supabase MCP. Recorded here for version-control traceability.
--
-- Purpose: make promo / referral one-use enforcement ATOMIC. Previously the
-- server enforced "one use per customer" (promo) and "first order only"
-- (referral) by reading only *confirmed/finished* orders at checkout time, with
-- no DB uniqueness backstop and used_count incremented only after payment. Two
-- concurrent checkouts — or several unpaid pending orders — with the same code
-- all passed the check, so a 100%-off code could yield multiple free orders and
-- a referral could mint the referrer's store credit repeatedly.
--
-- discount_redemptions gives each (email, code) a single slot claimed atomically
-- via the primary key (INSERT ... ON CONFLICT DO NOTHING — the first writer
-- wins, concurrent losers get false). The slot auto-releases when the owning
-- order dies: release_discount_redemption is called on the synchronous failure
-- paths, and /api/cron sweeps redemptions whose order is cancelled/failed/gone.
-- This is ADDITIVE to the existing historical check (promoAlreadyRedeemed still
-- rejects a code already used on a past confirmed order), so no backfill is
-- needed and one-use enforcement is never loosened.

create table if not exists public.discount_redemptions (
  email text not null,
  code text not null,
  order_id text not null,
  created_at timestamptz not null default now(),
  primary key (email, code)
);

-- Service-role only, like orders / store_credit_ledger (RLS on, zero policies =
-- deny-all to anon/authenticated; only the service_role key reads/writes it).
alter table public.discount_redemptions enable row level security;

-- Atomically claim the (email, code) slot for this order. Returns true iff this
-- order now owns it (fresh claim OR an idempotent retry of the same order).
create or replace function public.reserve_discount_redemption(p_email text, p_code text, p_order_id text)
returns boolean
language plpgsql
set search_path = public
as $function$
begin
  insert into public.discount_redemptions (email, code, order_id)
  values (lower(p_email), upper(p_code), p_order_id)
  on conflict (email, code) do nothing;

  return exists (
    select 1 from public.discount_redemptions
    where email = lower(p_email) and code = upper(p_code) and order_id = p_order_id
  );
end;
$function$;

-- Free the slot(s) held by an order (called when a checkout abandons/fails).
create or replace function public.release_discount_redemption(p_order_id text)
returns void
language sql
set search_path = public
as $function$
  delete from public.discount_redemptions where order_id = p_order_id;
$function$;

-- Backstop sweep (run hourly by /api/cron): free any slot whose owning order has
-- since died (cancelled by the SQL expiry job / admin, failed payment) or no
-- longer exists. The 10-minute floor avoids racing a just-created reservation
-- whose order row is still being inserted. Returns the number of slots freed.
create or replace function public.sweep_discount_redemptions()
returns integer
language plpgsql
set search_path = public
as $function$
declare
  v_deleted integer;
begin
  with gone as (
    delete from public.discount_redemptions dr
    where dr.created_at < now() - interval '10 minutes'
      and not exists (
        select 1 from public.orders o
        where o.id = dr.order_id and o.status not in ('cancelled', 'failed')
      )
    returning 1
  )
  select count(*) into v_deleted from gone;
  return v_deleted;
end;
$function$;

-- Server-only, like the other RPCs.
revoke execute on function public.reserve_discount_redemption(text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_discount_redemption(text, text, text) to service_role;
revoke execute on function public.release_discount_redemption(text) from public, anon, authenticated;
grant execute on function public.release_discount_redemption(text) to service_role;
revoke execute on function public.sweep_discount_redemptions() from public, anon, authenticated;
grant execute on function public.sweep_discount_redemptions() to service_role;
