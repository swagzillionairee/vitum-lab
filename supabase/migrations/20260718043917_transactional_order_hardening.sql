-- Transactional payment/order state changes, arithmetic invariants, and least
-- privilege for the Data API and product-image storage.

-- Existing live rows were audited before this migration and satisfy these
-- invariants. Keep money on exact cents and prevent impossible order totals.
alter table public.orders
  add constraint orders_money_nonnegative check (
    gross_amount between 0 and 1000000 and discount_amount between 0 and 1000000 and net_amount between 0 and 1000000 and
    shipping_amount between 0 and 1000000 and credit_applied between 0 and 1000000 and
    (commission_amount is null or commission_amount between 0 and 1000000) and
    (pay_amount is null or pay_amount >= 0)
  ),
  add constraint orders_money_cent_scale check (
    gross_amount = round(gross_amount, 2) and
    discount_amount = round(discount_amount, 2) and
    net_amount = round(net_amount, 2) and
    shipping_amount = round(shipping_amount, 2) and
    credit_applied = round(credit_applied, 2) and
    (commission_amount is null or commission_amount = round(commission_amount, 2))
  ),
  add constraint orders_money_relationships check (
    discount_amount <= gross_amount and
    net_amount = gross_amount - discount_amount and
    credit_applied <= net_amount + shipping_amount and
    (commission_amount is null or commission_amount <= net_amount)
  ),
  add constraint orders_payment_method_check check (
    payment_method is null or payment_method in ('square', 'zelle', 'cashapp', 'venmo', 'ach', 'crypto')
  );

alter table public.promo_codes
  add constraint promo_codes_min_subtotal_check check (min_subtotal >= 0 and min_subtotal = round(min_subtotal, 2)),
  add constraint promo_codes_max_uses_check check (max_uses is null or max_uses > 0),
  add constraint promo_codes_used_count_check check (used_count >= 0 and (max_uses is null or used_count <= max_uses)),
  add constraint promo_codes_per_customer_limit_check check (per_customer_limit >= 0),
  add constraint promo_codes_dates_check check (starts_at is null or expires_at is null or starts_at <= expires_at);

alter table public.affiliate_payouts
  add constraint affiliate_payouts_cent_scale check (amount = round(amount, 2)),
  add constraint affiliate_payouts_note_length check (note is null or length(note) <= 500);

alter table public.store_credit_ledger
  add constraint store_credit_ledger_nonzero_cent_amount check (amount <> 0 and amount = round(amount, 2));

alter table public.store_settings
  add constraint store_settings_reward_values_check check (
    loyalty_percent between 0 and 100 and
    referral_referee_amount >= 0 and referral_referee_amount = round(referral_referee_amount, 2) and
    referral_referrer_amount >= 0 and referral_referrer_amount = round(referral_referrer_amount, 2) and
    referral_min_subtotal >= 0 and referral_min_subtotal = round(referral_min_subtotal, 2) and
    referral_buyer_discount between 0 and 100 and
    referral_bounty_amount >= 0 and referral_bounty_amount = round(referral_bounty_amount, 2) and
    referral_bounty_orders > 0 and
    referral_min_order >= 0 and referral_min_order = round(referral_min_order, 2)
  ),
  add constraint store_settings_dates_check check (
    sitewide_starts_at is null or sitewide_ends_at is null or sitewide_starts_at <= sitewide_ends_at
  );

-- Product uploads are minted by the admin API with service_role. The old policy
-- let every authenticated customer upload arbitrary files into the public bucket.
drop policy if exists admin_upload_product_images on storage.objects;

-- The browser uses server APIs for all mutable business data. RLS was already
-- deny-by-default, but remove the unnecessary table grants as defense in depth.
revoke all privileges on all tables in schema public from anon, authenticated;
grant select on public.products, public.inventory to anon, authenticated;

-- Positive-quantity stock primitives. Empty search_path plus qualified names
-- prevents object shadowing inside SECURITY DEFINER functions.
create or replace function public.decrement_stock(p_cart_code text, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stock integer;
begin
  if p_cart_code is null or btrim(p_cart_code) = '' or p_qty is null or p_qty <= 0 then
    raise exception 'invalid_stock_adjustment' using errcode = '22023';
  end if;
  update public.inventory
     set stock = stock - p_qty, updated_at = now()
   where cart_code = p_cart_code and stock >= p_qty
   returning stock into v_stock;
  if v_stock is null then
    raise exception 'insufficient_stock:%', p_cart_code using errcode = 'P0001';
  end if;
  return v_stock;
end;
$function$;

create or replace function public.increment_stock(p_cart_code text, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stock integer;
begin
  if p_cart_code is null or btrim(p_cart_code) = '' or p_qty is null or p_qty <= 0 then
    raise exception 'invalid_stock_adjustment' using errcode = '22023';
  end if;
  update public.inventory
     set stock = stock + p_qty, updated_at = now()
   where cart_code = p_cart_code
   returning stock into v_stock;
  if v_stock is null then
    raise exception 'unknown_inventory_item:%', p_cart_code using errcode = 'P0001';
  end if;
  return v_stock;
end;
$function$;

-- Serialize reservations by promo code, then enforce the global cap and the
-- per-customer cap against paid, pending, and just-created in-flight holders.
create or replace function public.reserve_discount_redemption(
  p_email text, p_code text, p_order_id text, p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_code text := upper(btrim(p_code));
  v_customer_count integer;
  v_pending_count integer;
  v_max_uses integer;
  v_used_count integer;
begin
  if v_email = '' or v_code = '' or p_order_id is null or btrim(p_order_id) = '' or p_limit is null or p_limit < 0 then
    raise exception 'invalid_discount_reservation' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_code, 0));
  if exists (select 1 from public.discount_redemptions where email = v_email and code = v_code and order_id = p_order_id) then
    return true;
  end if;

  if v_code <> '__REFERRAL__' then
    select max_uses, used_count into v_max_uses, v_used_count
      from public.promo_codes where code = v_code;
    if found and v_max_uses is not null then
      select count(*) into v_pending_count
        from public.discount_redemptions dr
        left join public.orders o on o.id = dr.order_id
       where dr.code = v_code
         and (o.status = 'pending' or (o.id is null and dr.created_at >= now() - interval '10 minutes'));
      if v_used_count + v_pending_count >= v_max_uses then return false; end if;
    end if;
  end if;

  if p_limit > 0 then
    select count(*) into v_customer_count
      from public.discount_redemptions dr
      left join public.orders o on o.id = dr.order_id
     where dr.email = v_email and dr.code = v_code
       and (o.status in ('pending', 'confirmed', 'finished') or (o.id is null and dr.created_at >= now() - interval '10 minutes'));
    if v_customer_count >= p_limit then return false; end if;
  end if;

  insert into public.discount_redemptions(email, code, order_id) values (v_email, v_code, p_order_id);
  return true;
end;
$function$;

create or replace function public.reserve_discount_redemption(p_email text, p_code text, p_order_id text)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select public.reserve_discount_redemption(p_email, p_code, p_order_id, 1);
$function$;

-- The payment claim and all inventory/promo mutations are one transaction.
create or replace function public.confirm_order_paid(
  p_order_id text,
  p_pay_currency text default null,
  p_pay_amount numeric default null,
  p_payment_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_cart_code text;
  v_quantity integer;
  v_price numeric;
begin
  if p_order_id is null or btrim(p_order_id) = '' or (p_pay_amount is not null and p_pay_amount < 0) then
    raise exception 'invalid_payment_confirmation' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'pending' then return false; end if;

  for v_item in select value from jsonb_array_elements(v_order.items) loop
    v_cart_code := v_item ->> 'cartCode';
    v_quantity := (v_item ->> 'quantity')::integer;
    v_price := (v_item ->> 'price')::numeric;
    if v_quantity <= 0 then raise exception 'invalid_order_quantity' using errcode = '22023'; end if;
    if v_price > 0 and v_cart_code <> 'bac-water-free' then
      perform public.decrement_stock(v_cart_code, v_quantity);
    end if;
  end loop;

  if v_order.discount_code is not null and exists (select 1 from public.promo_codes where code = upper(v_order.discount_code)) then
    update public.promo_codes
       set used_count = used_count + 1
     where code = upper(v_order.discount_code)
       and (max_uses is null or used_count < max_uses);
    if not found then raise exception 'promo_usage_limit:%', v_order.discount_code using errcode = 'P0001'; end if;
  end if;

  update public.orders
     set status = 'confirmed', confirmed_at = now(),
         pay_currency = p_pay_currency, pay_amount = p_pay_amount, payment_id = p_payment_id
   where id = p_order_id;
  return true;
end;
$function$;

-- Cancellation is the exact inverse of a successful, unshipped confirmation.
create or replace function public.cancel_order(
  p_order_id text,
  p_expected_status text,
  p_reason text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
begin
  if p_order_id is null or p_expected_status is null or p_reason is null or btrim(p_reason) = '' then
    raise exception 'invalid_order_cancellation' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> p_expected_status or v_order.status = 'cancelled' then return false; end if;

  if v_order.status in ('confirmed', 'finished') and v_order.fulfillment_status = 'unfulfilled' then
    for v_item in select value from jsonb_array_elements(v_order.items) loop
      if (v_item ->> 'price')::numeric > 0 and (v_item ->> 'cartCode') <> 'bac-water-free' then
        perform public.increment_stock(v_item ->> 'cartCode', (v_item ->> 'quantity')::integer);
      end if;
    end loop;
  end if;

  if v_order.status in ('confirmed', 'finished') and v_order.discount_code is not null then
    update public.promo_codes set used_count = greatest(0, used_count - 1) where code = upper(v_order.discount_code);
  end if;
  delete from public.discount_redemptions where order_id = p_order_id;
  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = left(p_reason, 500),
         admin_notes = case when p_note is null or btrim(p_note) = '' then admin_notes
                            else concat_ws(E'\n\n', nullif(admin_notes, ''), left(p_note, 2000)) end
   where id = p_order_id;
  return true;
end;
$function$;

-- Final concurrency-safe backstop for admin-recorded affiliate payouts.
create or replace function public.record_affiliate_payout(
  p_affiliate_id uuid, p_amount numeric, p_note text default null
)
returns public.affiliate_payouts
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_commission_percent numeric;
  v_earned numeric;
  v_paid numeric;
  v_row public.affiliate_payouts;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or length(coalesce(p_note, '')) > 500 then
    raise exception 'invalid_affiliate_payout' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_affiliate_id::text, 0));
  select commission_percent into v_commission_percent from public.affiliates where id = p_affiliate_id;
  if not found then raise exception 'affiliate_not_found' using errcode = 'P0002'; end if;
  select coalesce(sum(coalesce(commission_amount, round(net_amount * v_commission_percent / 100, 2))), 0)
    into v_earned from public.orders where affiliate_id = p_affiliate_id and status in ('confirmed', 'finished');
  select coalesce(sum(amount), 0) into v_paid from public.affiliate_payouts where affiliate_id = p_affiliate_id;
  if p_amount > round(greatest(0, v_earned - v_paid), 2) then
    raise exception 'payout_exceeds_outstanding' using errcode = 'P0001';
  end if;
  insert into public.affiliate_payouts(affiliate_id, amount, note)
  values (p_affiliate_id, p_amount, nullif(btrim(p_note), '')) returning * into v_row;
  return v_row;
end;
$function$;

-- CREATE OR REPLACE restores PUBLIC execute by default on new functions; reassert
-- the service-only boundary explicitly for every privileged RPC touched above.
revoke execute on function public.decrement_stock(text, integer) from public, anon, authenticated;
grant execute on function public.decrement_stock(text, integer) to service_role;
revoke execute on function public.increment_stock(text, integer) from public, anon, authenticated;
grant execute on function public.increment_stock(text, integer) to service_role;
revoke execute on function public.reserve_discount_redemption(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_discount_redemption(text, text, text, integer) to service_role;
revoke execute on function public.reserve_discount_redemption(text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_discount_redemption(text, text, text) to service_role;
revoke execute on function public.confirm_order_paid(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.confirm_order_paid(text, text, numeric, text) to service_role;
revoke execute on function public.cancel_order(text, text, text, text) from public, anon, authenticated;
grant execute on function public.cancel_order(text, text, text, text) to service_role;
revoke execute on function public.record_affiliate_payout(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.record_affiliate_payout(uuid, numeric, text) to service_role;
revoke execute on function public.update_products_updated_at() from public, anon, authenticated;
