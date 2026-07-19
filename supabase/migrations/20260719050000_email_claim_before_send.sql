-- Atomic claim-before-send for order emails.
--
-- The old pattern was check-then-send-then-stamp against an in-memory order row:
-- two concurrent confirmations (NowPayments firing confirmed+finished IPNs in
-- parallel, or a webhook racing an admin Re-check) could both pass the stale
-- emails_sent check and double-send the customer confirmation, the admin alert,
-- and the affiliate commission email. claim_email flips the emails_sent key only
-- when it is absent, under the row lock of a single UPDATE — exactly one caller
-- wins the claim and sends. release_email_claim rolls a claim back when the SMTP
-- send fails afterwards, so a later retry (or admin resend) can still deliver.

create or replace function public.claim_email(p_order_id text, p_event text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claimed boolean;
begin
  if p_order_id is null or btrim(p_order_id) = '' or p_event is null or btrim(p_event) = '' then
    raise exception 'invalid_email_claim' using errcode = '22023';
  end if;
  update public.orders
     set emails_sent = coalesce(emails_sent, '{}'::jsonb) || jsonb_build_object(p_event, now())
   where id = p_order_id
     and not (coalesce(emails_sent, '{}'::jsonb) ? p_event)
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$function$;

create or replace function public.release_email_claim(p_order_id text, p_event text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set emails_sent = emails_sent - p_event where id = p_order_id;
$$;

-- CREATE OR REPLACE grants PUBLIC execute by default; reassert service-only.
revoke execute on function public.claim_email(text, text) from public, anon, authenticated;
grant execute on function public.claim_email(text, text) to service_role;
revoke execute on function public.release_email_claim(text, text) from public, anon, authenticated;
grant execute on function public.release_email_claim(text, text) to service_role;
