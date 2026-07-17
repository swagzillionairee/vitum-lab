-- Applied to the live project (mddgtvwcwsmlbwiafdvq) on 2026-07-16 via the
-- Supabase MCP. Recorded here for version-control traceability.
--
-- Per-customer usage limit for promo codes + count-based redemption tracking.
-- Previously "one use per customer" was hard-wired: discount_redemptions had a
-- single slot per (email, code) [PK (email, code)]. Now a customer may use a code
-- up to per_customer_limit times (0 = unlimited), so the redemption table keys on
-- (email, code, order_id) and reservation enforces a count. Deleting a promo also
-- clears its discount_redemptions rows (see api/admin/[...slug].ts), and the
-- historical order scan is bounded by the promo's created_at, so deleting and
-- recreating a code resets the per-customer limit for everyone.

alter table public.promo_codes
  add column if not exists per_customer_limit int not null default 1;

-- Count-based redemptions: allow multiple rows per (email, code) (one per order).
alter table public.discount_redemptions drop constraint if exists discount_redemptions_pkey;
alter table public.discount_redemptions add primary key (email, code, order_id);

-- General reservation with a per-customer limit (0 = unlimited). Atomic via an
-- advisory lock keyed on (email, code) so concurrent checkouts can't overshoot.
create or replace function public.reserve_discount_redemption(p_email text, p_code text, p_order_id text, p_limit int)
returns boolean
language plpgsql
set search_path = public
as $function$
declare
  v_email text := lower(p_email);
  v_code  text := upper(p_code);
  v_count int;
begin
  -- Idempotent: this order already holds a slot.
  if exists (select 1 from public.discount_redemptions
             where email = v_email and code = v_code and order_id = p_order_id) then
    return true;
  end if;
  -- Serialize concurrent claims for this (email, code).
  perform pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_code, 0));
  if p_limit > 0 then
    select count(*) into v_count from public.discount_redemptions
      where email = v_email and code = v_code;
    if v_count >= p_limit then
      return false;
    end if;
  end if;
  insert into public.discount_redemptions (email, code, order_id)
    values (v_email, v_code, p_order_id);
  return true;
end;
$function$;

-- Keep the legacy 3-arg version working with the new PK (its old ON CONFLICT
-- (email, code) no longer applies) so already-deployed code stays correct until
-- the new code ships. Delegates to the 4-arg version with a limit of 1.
create or replace function public.reserve_discount_redemption(p_email text, p_code text, p_order_id text)
returns boolean
language plpgsql
set search_path = public
as $function$
begin
  return public.reserve_discount_redemption(p_email, p_code, p_order_id, 1);
end;
$function$;

revoke execute on function public.reserve_discount_redemption(text, text, text, int) from public, anon, authenticated;
grant  execute on function public.reserve_discount_redemption(text, text, text, int) to service_role;
revoke execute on function public.reserve_discount_redemption(text, text, text) from public, anon, authenticated;
grant  execute on function public.reserve_discount_redemption(text, text, text) to service_role;
