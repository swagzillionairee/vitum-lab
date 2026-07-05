-- Configurable promo pill shown next to the homepage "Featured Products"
-- heading. Owner-set text + color, managed in Admin → Promos. Purely cosmetic;
-- does not affect any pricing.
alter table store_settings
  add column if not exists featured_banner_active boolean not null default false,
  add column if not exists featured_banner_text text,
  add column if not exists featured_banner_color text;
