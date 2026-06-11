-- Applied to the live project (mddgtvwcwsmlbwiafdvq) on 2026-06-11 via the
-- Supabase MCP. Recorded here for version-control traceability.
--
-- Purpose: store_credit_balance now excludes EVERY ledger entry tied to a
-- cancelled/failed order, not just redemptions. Previously, loyalty/referral
-- credit earned on an order that was later cancelled persisted in the balance
-- (an accounting leak). Now a dead order both auto-refunds its reserved credit
-- AND claws back any loyalty/referral it earned. Entries with no order_id
-- (e.g. manual adjustments) are unaffected.

create or replace function public.store_credit_balance(p_email text)
returns numeric
language sql
stable
set search_path = public
as $function$
  select coalesce(sum(
    case when o.status in ('cancelled','failed') then 0
         else l.amount end
  ), 0)::numeric
  from public.store_credit_ledger l
  left join public.orders o on o.id = l.order_id
  where lower(l.email) = lower(p_email);
$function$;

-- CREATE OR REPLACE reset EXECUTE to the PUBLIC default — re-lock to service_role.
revoke execute on function public.store_credit_balance(text) from public, anon, authenticated;
grant execute on function public.store_credit_balance(text) to service_role;
