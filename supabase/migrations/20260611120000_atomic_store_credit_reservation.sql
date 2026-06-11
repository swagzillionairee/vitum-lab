-- Applied to the live project (mddgtvwcwsmlbwiafdvq) on 2026-06-11 via the
-- Supabase MCP. Recorded here for version-control traceability.
--
-- Purpose: make store-credit reservation atomic. Previously the server read the
-- balance (store_credit_balance) and inserted the negative "redemption" ledger
-- row as two separate steps, so two concurrent checkouts by the same customer
-- could both read the same balance and both reserve it — spending the credit
-- twice (and, via the $0 free-order path, confirming both orders instantly).
-- reserve_store_credit re-derives the balance and inserts the redemption in one
-- transaction under a per-customer advisory lock, refusing when funds are short.

create or replace function public.reserve_store_credit(p_email text, p_amount numeric, p_order_id text)
returns boolean
language plpgsql
set search_path = public
as $function$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    return true; -- nothing to reserve
  end if;

  -- Serialize reservations per customer so concurrent checkouts can't both
  -- pass the balance check before either redemption row lands.
  perform pg_advisory_xact_lock(hashtextextended(lower(p_email), 0));

  -- Retry / duplicate request for the same order: the redemption already
  -- exists (unique on (order_id, reason)), so the reservation stands.
  if exists (
    select 1 from store_credit_ledger
    where order_id = p_order_id and reason = 'redemption'
  ) then
    return true;
  end if;

  v_balance := public.store_credit_balance(p_email);
  if coalesce(v_balance, 0) < p_amount then
    return false; -- insufficient credit (e.g. a concurrent order spent it)
  end if;

  insert into store_credit_ledger (email, amount, reason, order_id)
  values (p_email, -p_amount, 'redemption', p_order_id);
  return true;
end;
$function$;

-- Server-only, like the other RPCs.
revoke execute on function public.reserve_store_credit(text, numeric, text) from public, anon, authenticated;
grant execute on function public.reserve_store_credit(text, numeric, text) to service_role;
