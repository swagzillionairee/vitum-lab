-- Applied to the live project (mddgtvwcwsmlbwiafdvq) on 2026-07-03 via the
-- Supabase MCP. Recorded here for version-control traceability.
--
-- Purpose: a minimal, atomic per-key rate limiter for unauthenticated write
-- endpoints. The contact form shares the one Gmail transport with every
-- transactional email, so an unthrottled spam loop could exhaust the daily send
-- cap and silently stop order/shipping confirmations. rate_limit_hit prunes the
-- key's window, counts what's left, and either records a hit (allow) or refuses.

create table if not exists public.rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limits_bucket_time on public.rate_limits (bucket, created_at);

-- Service-role only (RLS on, no policies = deny-all to anon/authenticated).
alter table public.rate_limits enable row level security;

-- Returns true when the hit is ALLOWED (under the limit for this rolling window),
-- false when the bucket is over p_max. Old rows for the bucket are pruned first.
create or replace function public.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = public
as $function$
declare
  v_count integer;
begin
  delete from public.rate_limits
  where bucket = p_bucket and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count from public.rate_limits where bucket = p_bucket;
  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limits (bucket) values (p_bucket);
  return true;
end;
$function$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
