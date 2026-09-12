-- SPDX-License-Identifier: Apache-2.0
-- OV-024: HMAC-verified IPN finalization. Return URL must not live here.
-- Spec: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html (PAY 2.1.0 IPN ACK, retrieved 2026-09-13).
alter table public.orders add column reconciliation text not null default 'NONE' check(reconciliation in('NONE','MANUAL_REVIEW'));

create table public.vnpay_ipn_receipts (
 id uuid primary key default gen_random_uuid(),
 txn_ref text not null check(txn_ref ~ '^[A-Za-z0-9]{1,100}$'),
 attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 provider_transaction_no text not null check(provider_transaction_no ~ '^[0-9]{1,15}$'),
 amount_times_100 bigint not null check(amount_times_100 between 100 and 999999999900),
 curr_code text not null default 'VND' check(curr_code='VND'),
 tmn_code text not null check(tmn_code ~ '^[A-Za-z0-9]{8}$'),
 response_code text not null check(response_code ~ '^[0-9]{2}$'),
 transaction_status text not null check(transaction_status ~ '^[0-9]{2}$'),
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 outcome text not null check(outcome in('PAID','FAILED','MANUAL_REVIEW')),
 created_at timestamptz not null default clock_timestamp()
);
create unique index vnpay_ipn_receipts_txn_digest on public.vnpay_ipn_receipts(txn_ref,payload_digest);
create unique index vnpay_ipn_receipts_one_paid on public.vnpay_ipn_receipts(txn_ref) where outcome in('PAID','MANUAL_REVIEW');

create table public.payment_exceptions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null unique references public.orders(id) on delete restrict,
 attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
 receipt_id uuid not null unique references public.vnpay_ipn_receipts(id) on delete restrict,
 reason text not null check(reason='late_payment'),
 acknowledged_at timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create index payment_exceptions_org_created_idx on public.payment_exceptions(organization_id,created_at desc,id);

alter table public.vnpay_ipn_receipts enable row level security;
alter table public.payment_exceptions enable row level security;
revoke all on public.vnpay_ipn_receipts,public.payment_exceptions from public,anon,authenticated,service_role;
grant select on public.vnpay_ipn_receipts,public.payment_exceptions to service_role;
create policy vnpay_ipn_receipts_read on public.vnpay_ipn_receipts for select to service_role using(true);
create policy payment_exceptions_read on public.payment_exceptions for select to service_role using(true);

create function public.guard_vnpay_ipn_receipt_state() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if tg_op='UPDATE' then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 return new;
end $$;
create trigger vnpay_ipn_receipt_state before update or delete on public.vnpay_ipn_receipts for each row execute function public.guard_vnpay_ipn_receipt_state();
create trigger payment_exceptions_no_delete before delete on public.payment_exceptions for each row execute function public.guard_vnpay_ipn_receipt_state();

create function public.finalize_vnpay_ipn(
 p_txn_ref text,p_tmn_code text,p_amount bigint,p_curr_code text,p_response_code text,p_transaction_status text,p_transaction_no text,p_payload_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare checkout_row public.vnpay_checkouts%rowtype; attempt_row public.payment_attempts%rowtype; order_row public.orders%rowtype;
 consume jsonb; now_ts timestamptz:=clock_timestamp(); receipt_id uuid; success boolean; prior_outcome text;
begin
 if p_txn_ref is null or p_tmn_code is null or p_amount is null or p_curr_code is null or p_response_code is null or p_transaction_status is null or p_transaction_no is null or p_payload_digest is null then
  return jsonb_build_object('RspCode','99','Message','Unknow error');
 end if;
 if p_txn_ref !~ '^[A-Za-z0-9]{1,100}$' or p_tmn_code !~ '^[A-Za-z0-9]{8}$' or p_curr_code<>'VND' or p_response_code !~ '^[0-9]{2}$' or p_transaction_status !~ '^[0-9]{2}$' or p_transaction_no !~ '^[0-9]{1,15}$' or p_payload_digest !~ '^[0-9a-f]{64}$' or p_amount<100 or p_amount>999999999900 then
  return case when p_curr_code is distinct from 'VND' or p_amount<100 or p_amount>999999999900 then jsonb_build_object('RspCode','04','Message','invalid amount') else jsonb_build_object('RspCode','99','Message','Unknow error') end;
 end if;
 select * into checkout_row from public.vnpay_checkouts c where c.txn_ref=p_txn_ref;
 if checkout_row.attempt_id is null then return jsonb_build_object('RspCode','01','Message','Order not found'); end if;
 perform pg_advisory_xact_lock(hashtextextended(checkout_row.attempt_id::text,26));
 select * into checkout_row from public.vnpay_checkouts c where c.txn_ref=p_txn_ref;
 if checkout_row.tmn_code is distinct from p_tmn_code then return jsonb_build_object('RspCode','01','Message','Order not found'); end if;
 if checkout_row.curr_code is distinct from p_curr_code or checkout_row.amount_vnd*100 is distinct from p_amount then
  return jsonb_build_object('RspCode','04','Message','invalid amount');
 end if;
 select * into order_row from public.orders o where o.id=checkout_row.order_id for update;
 perform public.lock_order_reservation_skus(order_row.id);
 select * into attempt_row from public.payment_attempts a where a.id=checkout_row.attempt_id for update;
 if attempt_row.id is null or attempt_row.frozen_total_vnd is distinct from checkout_row.amount_vnd or attempt_row.currency is distinct from 'VND' then
  return jsonb_build_object('RspCode','04','Message','invalid amount');
 end if;
 select r.outcome into prior_outcome from public.vnpay_ipn_receipts r where r.txn_ref=p_txn_ref and r.payload_digest=p_payload_digest;
 if prior_outcome is not null then
  return jsonb_build_object('RspCode','02','Message','Order already confirmed','outcome',prior_outcome,'paymentStatus',order_row.payment_status,'fulfilmentStatus',order_row.fulfilment_status,'reconciliation',order_row.reconciliation);
 end if;
 select r.outcome into prior_outcome from public.vnpay_ipn_receipts r where r.txn_ref=p_txn_ref and r.outcome in('PAID','MANUAL_REVIEW');
 if prior_outcome is not null then
  return jsonb_build_object('RspCode','02','Message','Order already confirmed','outcome',prior_outcome,'paymentStatus',order_row.payment_status,'fulfilmentStatus',order_row.fulfilment_status,'reconciliation',order_row.reconciliation);
 end if;
 success:=(p_response_code='00' and p_transaction_status='00');
 if not success then
  select r.outcome into prior_outcome from public.vnpay_ipn_receipts r where r.txn_ref=p_txn_ref and r.outcome='FAILED';
  if prior_outcome is not null then
   return jsonb_build_object('RspCode','02','Message','Order already confirmed','outcome','FAILED','paymentStatus',order_row.payment_status,'fulfilmentStatus',order_row.fulfilment_status,'reconciliation',order_row.reconciliation);
  end if;
  receipt_id:=gen_random_uuid();
  insert into public.vnpay_ipn_receipts(id,txn_ref,attempt_id,organization_id,order_id,provider_transaction_no,amount_times_100,curr_code,tmn_code,response_code,transaction_status,payload_digest,outcome,created_at)
  values(receipt_id,p_txn_ref,attempt_row.id,checkout_row.organization_id,checkout_row.order_id,p_transaction_no,p_amount,'VND',p_tmn_code,p_response_code,p_transaction_status,p_payload_digest,'FAILED',now_ts);
  update public.orders set payment_status='FAILED',updated_at=now_ts where id=order_row.id and payment_status='UNPAID';
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(checkout_row.organization_id,'system','order.payment_failed','order',order_row.id,'payment.failed',attempt_row.id,receipt_id)
  on conflict(idempotency_key) do nothing;
  select o.payment_status,o.fulfilment_status,o.reconciliation into order_row.payment_status,order_row.fulfilment_status,order_row.reconciliation from public.orders o where o.id=order_row.id;
  return jsonb_build_object('RspCode','00','Message','Confirm Success','outcome','FAILED','paymentStatus',order_row.payment_status,'fulfilmentStatus',order_row.fulfilment_status,'reconciliation',order_row.reconciliation);
 end if;
 consume:=public.consume_inventory_attempt(checkout_row.organization_id,checkout_row.attempt_id);
 receipt_id:=gen_random_uuid();
 select * into order_row from public.orders o where o.id=checkout_row.order_id;
 select * into attempt_row from public.payment_attempts a where a.id=checkout_row.attempt_id;
 if consume->>'status'='consumed' then
  insert into public.vnpay_ipn_receipts(id,txn_ref,attempt_id,organization_id,order_id,provider_transaction_no,amount_times_100,curr_code,tmn_code,response_code,transaction_status,payload_digest,outcome,created_at)
  values(receipt_id,p_txn_ref,attempt_row.id,checkout_row.organization_id,checkout_row.order_id,p_transaction_no,p_amount,'VND',p_tmn_code,p_response_code,p_transaction_status,p_payload_digest,'PAID',now_ts);
  update public.orders set payment_status='PAID',fulfilment_status='PREPARING',payment_id=receipt_id,reconciliation='NONE',updated_at=now_ts where id=order_row.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(checkout_row.organization_id,'system','order.payment_paid','order',order_row.id,'payment.verified',attempt_row.id,receipt_id)
  on conflict(idempotency_key) do nothing;
  return jsonb_build_object('RspCode','00','Message','Confirm Success','outcome','PAID','paymentStatus','PAID','fulfilmentStatus','PREPARING','reconciliation','NONE');
 end if;
 if consume->>'status'='released' then
  insert into public.vnpay_ipn_receipts(id,txn_ref,attempt_id,organization_id,order_id,provider_transaction_no,amount_times_100,curr_code,tmn_code,response_code,transaction_status,payload_digest,outcome,created_at)
  values(receipt_id,p_txn_ref,attempt_row.id,checkout_row.organization_id,checkout_row.order_id,p_transaction_no,p_amount,'VND',p_tmn_code,p_response_code,p_transaction_status,p_payload_digest,'MANUAL_REVIEW',now_ts);
  update public.orders set payment_status='PAID',payment_id=receipt_id,reconciliation='MANUAL_REVIEW',updated_at=now_ts where id=order_row.id;
  insert into public.payment_exceptions(organization_id,order_id,attempt_id,receipt_id,reason)
  values(checkout_row.organization_id,order_row.id,attempt_row.id,receipt_id,'late_payment')
  on conflict(order_id) do nothing;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(checkout_row.organization_id,'system','order.payment_late','order',order_row.id,'payment.manual_review',attempt_row.id,receipt_id)
  on conflict(idempotency_key) do nothing;
  select o.fulfilment_status into order_row.fulfilment_status from public.orders o where o.id=order_row.id;
  return jsonb_build_object('RspCode','00','Message','Confirm Success','outcome','MANUAL_REVIEW','paymentStatus','PAID','fulfilmentStatus',order_row.fulfilment_status,'reconciliation','MANUAL_REVIEW');
 end if;
 return jsonb_build_object('RspCode','99','Message','Unknow error');
exception when unique_violation then
 select o.payment_status,o.fulfilment_status,o.reconciliation into order_row.payment_status,order_row.fulfilment_status,order_row.reconciliation from public.orders o where o.id=checkout_row.order_id;
 return jsonb_build_object('RspCode','02','Message','Order already confirmed','outcome',coalesce(order_row.payment_status,'PAID'),'paymentStatus',order_row.payment_status,'fulfilmentStatus',order_row.fulfilment_status,'reconciliation',order_row.reconciliation);
end $$;

revoke all on function public.guard_vnpay_ipn_receipt_state(),public.finalize_vnpay_ipn(text,text,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_vnpay_ipn(text,text,bigint,text,text,text,text,text) to service_role;
