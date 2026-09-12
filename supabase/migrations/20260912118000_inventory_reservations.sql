-- SPDX-License-Identifier: Apache-2.0
-- Atomic 15-minute SKU reservations at payment start. Confirm does not reserve.
-- available = physical - ACTIVE reserved. Catalog stock writes cannot drop below reserved.
create table public.payment_attempts (
 id uuid primary key,
 request_id uuid not null unique,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 expected_version integer not null check(expected_version>0),
 frozen_total_vnd bigint not null check(frozen_total_vnd between 1 and 9007199254740991),
 currency text not null default 'VND' check(currency='VND'),
 status text not null check(status in('ACTIVE','CONSUMED','RELEASED')),
 expires_at timestamptz not null,
 created_at timestamptz not null,
 updated_at timestamptz not null
);
create unique index payment_attempts_one_active on public.payment_attempts(order_id) where status='ACTIVE';
create index payment_attempts_due_idx on public.payment_attempts(expires_at,id) where status='ACTIVE';
create table public.inventory_reservations (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 product_id uuid not null references public.products(id) on delete restrict,
 variant_id uuid references public.product_variants(id) on delete restrict,
 quantity integer not null check(quantity between 1 and 10000),
 state text not null check(state in('ACTIVE','CONSUMED','RELEASED')),
 expires_at timestamptz not null,
 created_at timestamptz not null,
 updated_at timestamptz not null
);
create unique index inventory_reservations_attempt_sku on public.inventory_reservations(attempt_id,product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index inventory_reservations_sku_active_idx on public.inventory_reservations(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) where state='ACTIVE';

alter table public.payment_attempts enable row level security;
alter table public.inventory_reservations enable row level security;
revoke all on public.payment_attempts,public.inventory_reservations from public,anon,authenticated,service_role;
grant select on public.payment_attempts,public.inventory_reservations to service_role;
create policy payment_attempts_read on public.payment_attempts for select to service_role using(true);
create policy inventory_reservations_read on public.inventory_reservations for select to service_role using(true);

create function public.sku_active_reserved(p_product_id uuid,p_variant_id uuid) returns integer language sql stable set search_path='' as $$
 select coalesce(sum(r.quantity),0)::integer from public.inventory_reservations r
 where r.product_id=p_product_id and r.variant_id is not distinct from p_variant_id and r.state='ACTIVE'
$$;

create function public.guard_reserved_physical_stock() returns trigger language plpgsql set search_path='' as $$
declare reserved integer;
begin
 if tg_table_name='product_variants' then
  reserved:=public.sku_active_reserved(new.product_id,new.id);
  if reserved>0 and (new.stock_quantity is null or new.stock_quantity<reserved) then raise exception using errcode='22023',message='CATALOG_STOCK_RESERVED'; end if;
  return new;
 end if;
 if exists(select 1 from public.product_variants where product_id=new.id) then return new; end if;
 reserved:=public.sku_active_reserved(new.id,null);
 if reserved>0 and (new.stock_quantity is null or new.stock_quantity<reserved) then raise exception using errcode='22023',message='CATALOG_STOCK_RESERVED'; end if;
 return new;
end $$;
create trigger products_reserved_stock before update of stock_quantity on public.products for each row execute function public.guard_reserved_physical_stock();
create trigger product_variants_reserved_stock before update of stock_quantity on public.product_variants for each row execute function public.guard_reserved_physical_stock();

create function public.guard_payment_attempt_state() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if tg_op='INSERT' then
  if new.status<>'ACTIVE' then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
  return new;
 end if;
 if row(new.id,new.request_id,new.organization_id,new.order_id,new.expected_version,new.frozen_total_vnd,new.currency,new.created_at) is distinct from row(old.id,old.request_id,old.organization_id,old.order_id,old.expected_version,old.frozen_total_vnd,old.currency,old.created_at) then
  raise exception using errcode='22023',message='ORDER_INVALID';
 end if;
 if old.status='ACTIVE' and new.status in('ACTIVE','CONSUMED','RELEASED') then return new; end if;
 if old.status=new.status then return new; end if;
 raise exception using errcode='22023',message='ORDER_INVALID';
end $$;
create trigger payment_attempt_state before insert or update or delete on public.payment_attempts for each row execute function public.guard_payment_attempt_state();

create function public.guard_inventory_reservation_state() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if tg_op='INSERT' then
  if new.state<>'ACTIVE' then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
  return new;
 end if;
 if row(new.id,new.attempt_id,new.organization_id,new.order_id,new.product_id,new.variant_id,new.quantity,new.created_at) is distinct from row(old.id,old.attempt_id,old.organization_id,old.order_id,old.product_id,old.variant_id,old.quantity,old.created_at) then
  raise exception using errcode='22023',message='ORDER_INVALID';
 end if;
 if old.state='ACTIVE' and new.state in('ACTIVE','CONSUMED','RELEASED') then return new; end if;
 if old.state=new.state then return new; end if;
 raise exception using errcode='22023',message='ORDER_INVALID';
end $$;
create trigger inventory_reservation_state before insert or update or delete on public.inventory_reservations for each row execute function public.guard_inventory_reservation_state();

create function public.lock_order_reservation_skus(p_order_id uuid) returns void language plpgsql set search_path='' as $$
begin
 perform 1 from public.products where id in(select product_id from public.order_items where order_id=p_order_id union select product_id from public.inventory_reservations where order_id=p_order_id) order by id for update;
 perform 1 from public.product_variants where id in(select variant_id from public.order_items where order_id=p_order_id and variant_id is not null union select variant_id from public.inventory_reservations where order_id=p_order_id and variant_id is not null) order by id for update;
end $$;

create function public.begin_payment(p_organization_id uuid,p_order_id uuid,p_expected_version integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.orders%rowtype; prior public.payment_attempts%rowtype; quote jsonb; item record;
 product public.products%rowtype; variant public.product_variants%rowtype; physical integer; reserved integer;
 now_ts timestamptz; expires timestamptz; attempt_id uuid; snapshot jsonb; frozen_total bigint;
begin
 if p_organization_id is null or p_order_id is null or p_expected_version is null or p_expected_version<=0 or p_request_id is null then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,25));
 select * into prior from public.payment_attempts where request_id=p_request_id;
 if found then
  if row(prior.organization_id,prior.order_id,prior.expected_version) is distinct from row(p_organization_id,p_order_id,p_expected_version) then raise exception using errcode='40001',message='ORDER_REQUEST_CONFLICT'; end if;
  return jsonb_build_object('attemptId',prior.id,'frozenTotalVnd',prior.frozen_total_vnd,'expiresAt',prior.expires_at);
 end if;
 select * into existing from public.orders where id=p_order_id and organization_id=p_organization_id for update;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if existing.revision is distinct from p_expected_version then raise exception using errcode='40001',message='ORDER_VERSION_CONFLICT'; end if;
 if existing.fulfilment_status<>'DRAFT' or existing.payment_status<>'UNPAID' or existing.checkout_frozen_at is not null then raise exception using errcode='55000',message='ORDER_FROZEN'; end if;
 quote:=public.read_confirmed_order_quote(p_organization_id,p_order_id);
 if quote is null then raise exception using errcode='22023',message='ORDER_QUOTE_REQUIRED'; end if;
 if (quote->>'revision')::integer is distinct from p_expected_version then raise exception using errcode='40001',message='ORDER_VERSION_CONFLICT'; end if;
 perform public.lock_order_reservation_skus(p_order_id);
 for item in select * from public.order_items where order_id=p_order_id order by line_number loop
  select * into product from public.products where id=item.product_id and organization_id=p_organization_id;
  if not found or product.disabled_at is not null or product.version is distinct from item.product_version or product.currency<>'VND' then raise exception using errcode='40001',message='ORDER_CATALOG_CHANGED'; end if;
  if item.variant_id is null then
   if exists(select 1 from public.product_variants where product_id=item.product_id) then raise exception using errcode='22023',message='ORDER_VARIANT_REQUIRED'; end if;
   if product.price_vnd is distinct from item.unit_price_vnd then raise exception using errcode='40001',message='ORDER_CATALOG_CHANGED'; end if;
   physical:=product.stock_quantity; reserved:=public.sku_active_reserved(item.product_id,null);
  else
   select * into variant from public.product_variants where id=item.variant_id and product_id=item.product_id;
   if not found or variant.disabled_at is not null then raise exception using errcode='22023',message='ORDER_PRODUCT_UNAVAILABLE'; end if;
   if variant.price_vnd is distinct from item.unit_price_vnd then raise exception using errcode='40001',message='ORDER_CATALOG_CHANGED'; end if;
   physical:=variant.stock_quantity; reserved:=public.sku_active_reserved(item.product_id,item.variant_id);
  end if;
  if physical is null then raise exception using errcode='22023',message='ORDER_STOCK_UNKNOWN'; end if;
  if physical-reserved<item.quantity then raise exception using errcode='22023',message='ORDER_STOCK_UNAVAILABLE'; end if;
 end loop;
 snapshot:=public.freeze_order_checkout_snapshot(p_organization_id,p_order_id,p_expected_version,p_request_id);
 frozen_total:=(snapshot->>'totalVnd')::bigint;
 if frozen_total is null or frozen_total<=0 then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 now_ts:=clock_timestamp(); expires:=now_ts+interval '15 minutes'; attempt_id:=gen_random_uuid();
 insert into public.payment_attempts(id,request_id,organization_id,order_id,expected_version,frozen_total_vnd,currency,status,expires_at,created_at,updated_at)
 values(attempt_id,p_request_id,p_organization_id,p_order_id,p_expected_version,frozen_total,'VND','ACTIVE',expires,now_ts,now_ts);
 insert into public.inventory_reservations(attempt_id,organization_id,order_id,product_id,variant_id,quantity,state,expires_at,created_at,updated_at)
 select attempt_id,p_organization_id,p_order_id,i.product_id,i.variant_id,i.quantity,'ACTIVE',expires,now_ts,now_ts from public.order_items i where i.order_id=p_order_id;
 update public.orders set fulfilment_status='AWAITING_PAYMENT',reservation_id=attempt_id,updated_at=now_ts where id=p_order_id;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'system','order.reservation_started','order',p_order_id,'reservation.started',p_request_id,attempt_id);
 return jsonb_build_object('attemptId',attempt_id,'frozenTotalVnd',frozen_total,'expiresAt',expires);
end $$;

create function public.expire_inventory_attempt(p_organization_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.payment_attempts%rowtype; existing public.orders%rowtype; now_ts timestamptz:=clock_timestamp();
begin
 if p_organization_id is null or p_attempt_id is null then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_attempt_id::text,26));
 select * into attempt from public.payment_attempts where id=p_attempt_id and organization_id=p_organization_id;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 select * into existing from public.orders where id=attempt.order_id for update;
 perform public.lock_order_reservation_skus(existing.id);
 select * into attempt from public.payment_attempts where id=p_attempt_id for update;
 if attempt.status='CONSUMED' then return jsonb_build_object('status','consumed','attemptId',attempt.id,'frozenTotalVnd',attempt.frozen_total_vnd); end if;
 if attempt.status='RELEASED' then return jsonb_build_object('status','released','attemptId',attempt.id,'frozenTotalVnd',attempt.frozen_total_vnd); end if;
 if now_ts<attempt.expires_at then return jsonb_build_object('status','active','attemptId',attempt.id,'frozenTotalVnd',attempt.frozen_total_vnd); end if;
 update public.inventory_reservations set state='RELEASED',updated_at=now_ts where attempt_id=p_attempt_id and state='ACTIVE';
 update public.payment_attempts set status='RELEASED',updated_at=now_ts where id=p_attempt_id;
 update public.orders set fulfilment_status='EXPIRED',updated_at=now_ts where id=existing.id and fulfilment_status='AWAITING_PAYMENT' and payment_status='UNPAID';
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'system','order.reservation_released','order',existing.id,'reservation.expired',p_attempt_id,p_attempt_id)
 on conflict(idempotency_key) do nothing;
 return jsonb_build_object('status','released','attemptId',p_attempt_id,'frozenTotalVnd',attempt.frozen_total_vnd);
end $$;

create function public.consume_inventory_attempt(p_organization_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.payment_attempts%rowtype; existing public.orders%rowtype; rec record; now_ts timestamptz:=clock_timestamp();
begin
 if p_organization_id is null or p_attempt_id is null then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_attempt_id::text,26));
 select * into attempt from public.payment_attempts where id=p_attempt_id and organization_id=p_organization_id;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 select * into existing from public.orders where id=attempt.order_id for update;
 perform public.lock_order_reservation_skus(existing.id);
 select * into attempt from public.payment_attempts where id=p_attempt_id for update;
 if attempt.status='CONSUMED' then return jsonb_build_object('status','consumed','attemptId',attempt.id,'frozenTotalVnd',attempt.frozen_total_vnd); end if;
 if attempt.status='RELEASED' then return jsonb_build_object('status','released','attemptId',attempt.id,'frozenTotalVnd',attempt.frozen_total_vnd); end if;
 if now_ts>=attempt.expires_at then
  update public.inventory_reservations set state='RELEASED',updated_at=now_ts where attempt_id=p_attempt_id and state='ACTIVE';
  update public.payment_attempts set status='RELEASED',updated_at=now_ts where id=p_attempt_id;
  update public.orders set fulfilment_status='EXPIRED',updated_at=now_ts where id=existing.id and fulfilment_status='AWAITING_PAYMENT' and payment_status='UNPAID';
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_organization_id,'system','order.reservation_released','order',existing.id,'reservation.late_payment',p_attempt_id,p_attempt_id)
  on conflict(idempotency_key) do nothing;
  return jsonb_build_object('status','released','attemptId',p_attempt_id,'frozenTotalVnd',attempt.frozen_total_vnd);
 end if;
 for rec in select * from public.inventory_reservations where attempt_id=p_attempt_id and state='ACTIVE' order by product_id,variant_id nulls first loop
  update public.inventory_reservations set state='CONSUMED',updated_at=now_ts where id=rec.id;
  if rec.variant_id is null then
   update public.products set stock_quantity=stock_quantity-rec.quantity,in_stock=case when stock_quantity-rec.quantity=0 then false else in_stock end,updated_at=now_ts where id=rec.product_id;
  else
   update public.product_variants set stock_quantity=stock_quantity-rec.quantity,in_stock=case when stock_quantity-rec.quantity=0 then false else in_stock end,updated_at=now_ts where id=rec.variant_id;
   update public.products p set stock_quantity=(select case when count(*) filter(where v.stock_quantity is null)>0 then null else coalesce(sum(v.stock_quantity),0)::integer end from public.product_variants v where v.product_id=p.id and v.disabled_at is null),
    in_stock=coalesce((select bool_or(v.in_stock) from public.product_variants v where v.product_id=p.id and v.disabled_at is null),false),updated_at=now_ts where p.id=rec.product_id;
  end if;
 end loop;
 update public.payment_attempts set status='CONSUMED',updated_at=now_ts where id=p_attempt_id;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'system','order.reservation_consumed','order',existing.id,'reservation.consumed',p_attempt_id,p_attempt_id)
 on conflict(idempotency_key) do nothing;
 return jsonb_build_object('status','consumed','attemptId',p_attempt_id,'frozenTotalVnd',attempt.frozen_total_vnd);
end $$;

create function public.expire_due_inventory_attempts() returns integer language plpgsql security definer set search_path='' as $$
declare rec record; n integer:=0;
begin
 for rec in select organization_id,id from public.payment_attempts where status='ACTIVE' and expires_at<=clock_timestamp() order by order_id,id loop
  perform public.expire_inventory_attempt(rec.organization_id,rec.id); n:=n+1;
 end loop;
 return n;
end $$;

revoke all on function public.sku_active_reserved(uuid,uuid),public.guard_reserved_physical_stock(),public.guard_payment_attempt_state(),public.guard_inventory_reservation_state(),public.lock_order_reservation_skus(uuid) from public,anon,authenticated,service_role;
revoke all on function public.begin_payment(uuid,uuid,integer,uuid),public.expire_inventory_attempt(uuid,uuid),public.consume_inventory_attempt(uuid,uuid),public.expire_due_inventory_attempts() from public,anon,authenticated,service_role;
grant execute on function public.begin_payment(uuid,uuid,integer,uuid),public.expire_inventory_attempt(uuid,uuid),public.consume_inventory_attempt(uuid,uuid),public.expire_due_inventory_attempts() to service_role;
