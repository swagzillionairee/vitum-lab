-- Self-serve referral program (VertexLabs-style): anyone can create a code that
-- gives buyers a % off and earns the referrer a flat bounty per N paid orders.
--
-- Reuses the affiliates table (the checkout already applies an affiliate code's
-- discount and stamps orders.affiliate_id). is_referral distinguishes these
-- self-serve codes from curated %-commission affiliates. Config lives in
-- store_settings so the numbers are editable in Admin → Promos.
alter table affiliates
  add column if not exists is_referral boolean not null default false;

alter table store_settings
  add column if not exists referral_program_active boolean not null default false,
  add column if not exists referral_buyer_discount integer not null default 10,
  add column if not exists referral_bounty_amount numeric not null default 100,
  add column if not exists referral_bounty_orders integer not null default 5;
