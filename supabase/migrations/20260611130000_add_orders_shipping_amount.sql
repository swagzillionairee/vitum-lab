-- Flat $15 shipping fee on orders under $150 (free at $150+). The fee is
-- computed server-side at order creation (api/_lib/pricing.ts → shippingFee)
-- and stored per order; existing orders default to 0 (they all shipped free).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC NOT NULL DEFAULT 0;
