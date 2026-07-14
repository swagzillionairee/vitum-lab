-- Security hardening applied to the live project during the July 2026 audit;
-- retain it in source control so a fresh environment receives the same ACLs.
revoke execute on function public.decrement_promo_use(text) from public, anon, authenticated;
grant execute on function public.decrement_promo_use(text) to service_role;

revoke execute on function public.stamp_email(text, text) from public, anon, authenticated;
grant execute on function public.stamp_email(text, text) to service_role;

revoke execute on function public.expire_stale_orders() from public, anon, authenticated;
grant execute on function public.expire_stale_orders() to service_role;

-- Claim table for atomic one-time welcome-email delivery. RLS with no client
-- policies keeps it service-role only, matching other operational tables.
create table if not exists public.welcome_sent (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.welcome_sent enable row level security;
