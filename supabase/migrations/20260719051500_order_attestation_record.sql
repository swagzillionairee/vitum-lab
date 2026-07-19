-- Durable record of the checkout 21+/research-use attestation, bound to the
-- order row. The storefront gate + checkout checkbox are ephemeral client
-- state; for an RUO category the store needs provable, timestamped evidence of
-- who attested, when, and from where. Written by create-crypto-payment as
-- { accepted, at, ip, version }; null on legacy orders placed before this.
alter table public.orders add column if not exists attestation jsonb;
