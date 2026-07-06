-- Referral codes (is_referral=true) earn a flat bounty, not a % commission, so
-- they carry commission_percent = 0. A 0% buyer discount is also a valid config.
-- The original checks required >= 1, which blocked creating referral codes
-- (the account-locked /referral flow inserts commission_percent = 0).
-- Relax both to >= 0 (a strict relaxation; existing 1-100 rows stay valid).
alter table public.affiliates drop constraint if exists affiliates_commission_percent_check;
alter table public.affiliates
  add constraint affiliates_commission_percent_check
  check (commission_percent >= 0 and commission_percent <= 100);

alter table public.affiliates drop constraint if exists affiliates_discount_percent_check;
alter table public.affiliates
  add constraint affiliates_discount_percent_check
  check (discount_percent >= 0 and discount_percent <= 100);
