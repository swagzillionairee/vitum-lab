-- Applied to the live project (mddgtvwcwsmlbwiafdvq) on 2026-06-11 via the
-- Supabase MCP. Recorded here for version-control traceability — this repo does
-- not (yet) use the Supabase CLI migration runner.
--
-- Purpose:
--   1. Stop the public `anon`/`authenticated` roles from executing server-only
--      RPCs. `increment_stock` and `increment_promo_use` are SECURITY DEFINER,
--      so with the public anon key anyone could inflate/zero inventory or burn a
--      promo's use count. These are only ever called by the server (service_role).
--   2. Drop the `is_active` gate from `decrement_stock` — storefront availability
--      is stock-driven, so an inactive-but-in-stock item must still decrement on a
--      paid order (otherwise the webhook silently fails to decrement → overselling).
--   3. Pin a stable `search_path` on the flagged functions (linter hardening).

-- (2) + search_path. CREATE OR REPLACE resets EXECUTE to the PUBLIC default;
-- the lock-down block below re-restricts it.
create or replace function public.decrement_stock(p_cart_code text, p_qty integer)
returns integer
language plpgsql
set search_path = public
as $function$
declare
  new_stock integer;
begin
  update inventory
     set stock = stock - p_qty, updated_at = now()
   where cart_code = p_cart_code and stock >= p_qty
   returning stock into new_stock;

  if new_stock is null then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  return new_stock;
end;
$function$;

-- (3) search_path on the other flagged functions.
alter function public.increment_promo_use(text) set search_path = public;
alter function public.store_credit_balance(text) set search_path = public;
alter function public.update_products_updated_at() set search_path = public;

-- (1) Lock the server-only RPCs to service_role.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.increment_stock(text, integer)',
    'public.decrement_stock(text, integer)',
    'public.increment_promo_use(text)',
    'public.store_credit_balance(text)',
    'public.rls_auto_enable()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
