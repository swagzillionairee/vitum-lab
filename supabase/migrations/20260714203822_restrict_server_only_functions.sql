-- Re-assert execute privileges after later CREATE OR REPLACE migrations.
-- PostgreSQL grants EXECUTE to PUBLIC for newly created functions; these RPCs
-- mutate inventory, discounts, email stamps, or operational state and are only
-- called by trusted server code (or, for expiry, pg_cron as postgres).
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    'public.increment_stock(text,integer)'::regprocedure,
    'public.decrement_stock(text,integer)'::regprocedure,
    'public.increment_promo_use(text)'::regprocedure,
    'public.decrement_promo_use(text)'::regprocedure,
    'public.store_credit_balance(text)'::regprocedure,
    'public.reserve_store_credit(text,numeric,text)'::regprocedure,
    'public.reserve_discount_redemption(text,text,text)'::regprocedure,
    'public.release_discount_redemption(text)'::regprocedure,
    'public.sweep_discount_redemptions()'::regprocedure,
    'public.rate_limit_hit(text,integer,integer)'::regprocedure,
    'public.stamp_email(text,text)'::regprocedure,
    'public.expire_stale_orders()'::regprocedure
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
