-- SPDX-License-Identifier: Apache-2.0
-- OV-023: persist unique VNPay txn ref per ACTIVE payment attempt. Return/IPN must not live here.
-- Spec: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html (PAY 2.1.0 HMACSHA512, retrieved 2026-09-12).
create table public.vnpay_checkouts (
 attempt_id uuid primary key references public.payment_attempts(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 txn_ref text not null unique check(txn_ref ~ '^[A-Za-z0-9]{1,100}$'),
 tmn_code text not null check(tmn_code ~ '^[A-Za-z0-9]{8}$'),
 amount_vnd bigint not null check(amount_vnd between 1 and 9999999999),
 curr_code text not null default 'VND' check(curr_code='VND'),
 create_date text not null check(create_date ~ '^[0-9]{14}$'),
 expire_date text not null check(expire_date ~ '^[0-9]{14}$'),
 ip_addr text not null check(char_length(ip_addr) between 7 and 45),
 payment_host text not null check(payment_host in('sandbox.vnpayment.vn','www.vnpayment.vn')),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.vnpay_checkouts enable row level security;
revoke all on public.vnpay_checkouts from public,anon,authenticated,service_role;
grant select on public.vnpay_checkouts to service_role;
create policy vnpay_checkouts_read on public.vnpay_checkouts for select to service_role using(true);

create function public.guard_vnpay_checkout_state() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if tg_op='UPDATE' then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 return new;
end $$;
create trigger vnpay_checkout_state before update or delete on public.vnpay_checkouts for each row execute function public.guard_vnpay_checkout_state();

create function public.read_vnpay_checkout_start(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token public.order_confirmation_tokens%rowtype; existing public.orders%rowtype; attempt public.payment_attempts%rowtype;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into token from public.order_confirmation_tokens where token_hash=p_token_hash;
 if not found or token.purpose<>'confirmation' or token.expires_at<=clock_timestamp() then return null; end if;
 select * into existing from public.orders where id=token.order_id and organization_id=token.organization_id;
 if not found then return null; end if;
 select * into attempt from public.payment_attempts where order_id=existing.id and status='ACTIVE';
 return jsonb_build_object(
  'organizationId',existing.organization_id,
  'orderId',existing.id,
  'revision',existing.revision,
  'paymentStatus',existing.payment_status,
  'fulfilmentStatus',existing.fulfilment_status,
  'attempt',case when attempt.id is null then null else jsonb_build_object('attemptId',attempt.id,'frozenTotalVnd',attempt.frozen_total_vnd,'expiresAt',attempt.expires_at,'status',attempt.status) end
 );
end $$;

create function public.persist_vnpay_checkout(
 p_organization_id uuid,p_attempt_id uuid,p_txn_ref text,p_tmn_code text,p_amount_vnd bigint,p_create_date text,p_expire_date text,p_ip_addr text,p_payment_host text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.payment_attempts%rowtype; existing public.vnpay_checkouts%rowtype; expected text;
begin
 if p_organization_id is null or p_attempt_id is null or p_txn_ref is null or p_tmn_code is null or p_amount_vnd is null or p_create_date is null or p_expire_date is null or p_ip_addr is null or p_payment_host is null then
  raise exception using errcode='22023',message='ORDER_INVALID';
 end if;
 if p_txn_ref !~ '^[A-Za-z0-9]{1,100}$' or p_tmn_code !~ '^[A-Za-z0-9]{8}$' or p_create_date !~ '^[0-9]{14}$' or p_expire_date !~ '^[0-9]{14}$' or char_length(p_ip_addr) not between 7 and 45 or p_payment_host not in('sandbox.vnpayment.vn','www.vnpayment.vn') or p_amount_vnd<1 or p_amount_vnd>9999999999 then
  raise exception using errcode='22023',message='ORDER_INVALID';
 end if;
 select * into attempt from public.payment_attempts where id=p_attempt_id and organization_id=p_organization_id for update;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if attempt.status<>'ACTIVE' then raise exception using errcode='22023',message='PAYMENT_EXPIRED'; end if;
 if attempt.frozen_total_vnd is distinct from p_amount_vnd then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 expected:=replace(attempt.id::text,'-','');
 if expected is distinct from p_txn_ref then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 select * into existing from public.vnpay_checkouts where attempt_id=p_attempt_id;
 if found then
  if existing.txn_ref is distinct from p_txn_ref or existing.amount_vnd is distinct from p_amount_vnd or existing.tmn_code is distinct from p_tmn_code or existing.payment_host is distinct from p_payment_host or existing.curr_code is distinct from 'VND' then
   raise exception using errcode='40001',message='ORDER_REQUEST_CONFLICT';
  end if;
  return jsonb_build_object('txnRef',existing.txn_ref,'attemptId',existing.attempt_id,'amountVnd',existing.amount_vnd,'tmnCode',existing.tmn_code,'createDate',existing.create_date,'expireDate',existing.expire_date,'ipAddr',existing.ip_addr,'paymentHost',existing.payment_host);
 end if;
 insert into public.vnpay_checkouts(attempt_id,organization_id,order_id,txn_ref,tmn_code,amount_vnd,curr_code,create_date,expire_date,ip_addr,payment_host)
 values(p_attempt_id,p_organization_id,attempt.order_id,p_txn_ref,p_tmn_code,p_amount_vnd,'VND',p_create_date,p_expire_date,p_ip_addr,p_payment_host);
 return jsonb_build_object('txnRef',p_txn_ref,'attemptId',p_attempt_id,'amountVnd',p_amount_vnd,'tmnCode',p_tmn_code,'createDate',p_create_date,'expireDate',p_expire_date,'ipAddr',p_ip_addr,'paymentHost',p_payment_host);
end $$;

create function public.read_vnpay_return(p_txn_ref text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare checkout public.vnpay_checkouts%rowtype; attempt public.payment_attempts%rowtype; existing public.orders%rowtype;
begin
 if p_txn_ref is null or p_txn_ref !~ '^[A-Za-z0-9]{1,100}$' then return null; end if;
 select * into checkout from public.vnpay_checkouts where txn_ref=p_txn_ref;
 if not found then return null; end if;
 select * into attempt from public.payment_attempts where id=checkout.attempt_id;
 select * into existing from public.orders where id=checkout.order_id;
 if not found or attempt.id is null then return null; end if;
 return jsonb_build_object(
  'txnRef',checkout.txn_ref,
  'attemptId',attempt.id,
  'frozenTotalVnd',attempt.frozen_total_vnd,
  'expiresAt',attempt.expires_at,
  'attemptStatus',attempt.status,
  'paymentStatus',existing.payment_status,
  'fulfilmentStatus',existing.fulfilment_status
 );
end $$;

revoke all on function public.guard_vnpay_checkout_state(),public.read_vnpay_checkout_start(text),public.persist_vnpay_checkout(uuid,uuid,text,text,bigint,text,text,text,text),public.read_vnpay_return(text) from public,anon,authenticated,service_role;
grant execute on function public.read_vnpay_checkout_start(text),public.persist_vnpay_checkout(uuid,uuid,text,text,bigint,text,text,text,text),public.read_vnpay_return(text) to service_role;
