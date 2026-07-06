-- Multi-method payments: Square (live cards) + manual P2P (Zelle/Cash App/Venmo/
-- bank ACH, admin-verified) + crypto (NowPayments). Tagada is retired.

-- Which processor/handle an order used — drives the admin "Mark paid" flow and
-- the auto-expiry window (manual transfers take longer than a crypto invoice).
alter table public.orders add column if not exists payment_method text;

-- Public, admin-editable payment config (handles are shown to customers at
-- checkout). A manual method is offered when enabled AND it has a handle; Square
-- is offered when enabled AND its env credentials are present (checked server-side).
alter table public.store_settings
  add column if not exists payment_config jsonb not null default jsonb_build_object(
    'square',  jsonb_build_object('enabled', false),
    'zelle',   jsonb_build_object('enabled', false, 'handle', '', 'instructions', ''),
    'cashapp', jsonb_build_object('enabled', false, 'handle', '', 'instructions', ''),
    'venmo',   jsonb_build_object('enabled', false, 'handle', '', 'instructions', ''),
    'ach',     jsonb_build_object('enabled', false, 'handle', '', 'instructions', ''),
    'crypto',  jsonb_build_object('enabled', true)
  );

-- Auto-expiry now depends on the method: an automated invoice (crypto/square/
-- legacy null) still dies at 24h, but a manual transfer the admin has to verify
-- gets 14 days before it's swept (releasing any reserved store credit).
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
       (payment_method IN ('zelle','cashapp','venmo','ach') AND created_at < now() - interval '14 days')
     );
$$;

-- Repoint the hourly pg_cron job at the method-aware function (was inline SQL):
--   select cron.alter_job(
--     job_id := (select jobid from cron.job where jobname = 'expire-stale-orders'),
--     command := 'SELECT public.expire_stale_orders();');
