-- Minimum qualifying order value (net, after discounts/promos) for a referred
-- order to count toward the referrer's bounty. Guards against low-value farming
-- and keeps every counted order comfortably profitable after the amortized
-- bounty. 0 = no minimum. Configured in Admin → Promos → Referral Program.
alter table public.store_settings
  add column if not exists referral_min_order numeric not null default 0;

-- Recommended starting floor: with a ~60% margin and a $100-per-5-orders bounty
-- (~$20/order amortized), break-even is ~$34; $50 keeps a real profit per order.
update public.store_settings set referral_min_order = 50;
