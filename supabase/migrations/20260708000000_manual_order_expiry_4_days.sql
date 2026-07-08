-- Manual transfers (Zelle/Cash App/Venmo/ACH) now expire after 4 days instead
-- of 14 — the customer sees a live countdown at checkout / on the order.
-- Automated invoices (crypto/square/legacy null) still die at 24h.
CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = 'auto-expired: payment not received in time'
   WHERE status = 'pending'
     AND (
       (coalesce(payment_method, 'crypto') IN ('crypto','square') AND created_at < now() - interval '24 hours')
       OR
       (payment_method IN ('zelle','cashapp','venmo','ach') AND created_at < now() - interval '4 days')
     );
$$;
