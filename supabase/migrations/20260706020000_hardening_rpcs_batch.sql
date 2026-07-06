-- Security/correctness hardening batch (July 2026 audit).

-- 1) Refund clawback: return a promo's global max_uses slot when a paid order
-- is refunded (mirror of increment_promo_use; floors at 0).
create or replace function public.decrement_promo_use(p_code text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.promo_codes set used_count = greatest(0, used_count - 1) where upper(code) = upper(p_code);
$$;

-- 2) Orphaned ledger entries: a hard-deleted order left its ledger rows counting
-- again (the left join's else-branch). Treat a dangling order_id like a dead
-- order — excluded — so deleting a cancelled/pending order can't resurrect
-- clawed-back credit or destroy still-reserved credit.
create or replace function public.store_credit_balance(p_email text)
returns numeric
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(
    case
      when l.order_id is not null and o.id is null then 0          -- orphaned (order deleted)
      when o.status in ('cancelled','failed') then 0               -- dead order
      else l.amount
    end
  ), 0)::numeric
  from public.store_credit_ledger l
  left join public.orders o on o.id = l.order_id
  where lower(l.email) = lower(p_email);
$$;

-- 3) rate_limit_hit was check-then-insert with no serialization, so N concurrent
-- requests under the cap all passed. Serialize per bucket with a transaction-
-- scoped advisory lock.
create or replace function public.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 42));

  delete from public.rate_limits
  where bucket = p_bucket and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count from public.rate_limits where bucket = p_bucket;
  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limits (bucket) values (p_bucket);
  return true;
end;
$$;

-- 4) Email idempotency stamps were read-merge-write in JS: two concurrent stamps
-- for different events lost one (re-arming a duplicate email later). Merge
-- atomically in SQL instead.
create or replace function public.stamp_email(p_order_id text, p_event text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.orders
  set emails_sent = coalesce(emails_sent, '{}'::jsonb) || jsonb_build_object(p_event, now())
  where id = p_order_id;
$$;
