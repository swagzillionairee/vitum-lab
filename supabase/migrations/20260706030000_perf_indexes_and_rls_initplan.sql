-- Performance pass (July 2026 audit follow-up). orders had ONLY its PK index,
-- so every lookup by email / affiliate_id / status / discount_code was a
-- sequential scan. Irrelevant at today's row count; cheap insurance for growth.

-- Account order history + customer-spend tallies + public tracking (email is
-- stored lowercased by the API).
create index if not exists idx_orders_email on public.orders (email);

-- Affiliate stats, referral-program counts, commission tallies.
create index if not exists idx_orders_affiliate_id on public.orders (affiliate_id) where affiliate_id is not null;

-- Status filters (paid/pending sweeps, cron expiry) + created_at pagination order.
create index if not exists idx_orders_status_created on public.orders (status, created_at);

-- Promo one-use / max_uses checks.
create index if not exists idx_orders_discount_code on public.orders (discount_code) where discount_code is not null;

-- Cron delivery polling scans shipped orders.
create index if not exists idx_orders_fulfillment on public.orders (fulfillment_status) where fulfillment_status = 'shipped';

-- Advisor: FK without covering index (payout history joins).
create index if not exists idx_affiliate_payouts_affiliate_id on public.affiliate_payouts (affiliate_id);

-- Advisor: RLS initplan — auth.uid() was re-evaluated per row; wrapping it in a
-- scalar subquery evaluates it once per statement.
alter policy "Affiliate reads own row" on public.affiliates
  using ((select auth.uid()) = user_id);
