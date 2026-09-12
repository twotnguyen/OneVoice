-- SPDX-License-Identifier: Apache-2.0
-- OV-025 staff fulfilment: PREPARING→DELIVERING→DELIVERED. No SHIPPING, mark-paid, or refund.
alter table public.orders add column tracking_ref text check(tracking_ref is null or length(trim(tracking_ref)) between 1 and 80);
alter table public.orders add column customer_visible_progress text not null default '' check(length(customer_visible_progress)<=4000);
alter table public.orders add column internal_note text not null default '' check(length(internal_note)<=4000);
create index orders_org_fulfilment_updated_idx on public.orders(organization_id,fulfilment_status,updated_at desc,id);

create table public.order_fulfilment_history (
 request_id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 actor_id uuid not null,
 expected_version integer not null check(expected_version>0),
 version integer not null check(version>0),
 fulfilment_status text not null check(fulfilment_status in('PREPARING','DELIVERING','DELIVERED')),
 tracking_ref text,
 customer_visible_progress text not null default '',
 internal_note text not null default '',
 created_at timestamptz not null default clock_timestamp(),
 unique(order_id,version)
);
create trigger order_fulfilment_history_immutable before update or delete on public.order_fulfilment_history for each row execute function public.reject_audit_mutation();
create trigger order_fulfilment_history_no_truncate before truncate on public.order_fulfilment_history for each statement execute function public.reject_audit_mutation();
alter table public.order_fulfilment_history enable row level security;
revoke all on public.order_fulfilment_history from public,anon,authenticated,service_role;
grant select on public.order_fulfilment_history to service_role;
create policy order_fulfilment_history_read on public.order_fulfilment_history for select to service_role using(true);

create function public.guard_payment_exception_ack() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.id,new.organization_id,new.order_id,new.attempt_id,new.receipt_id,new.reason,new.created_at) is distinct from row(old.id,old.organization_id,old.order_id,old.attempt_id,old.receipt_id,old.reason,old.created_at) then
  raise exception using errcode='22023',message='ORDER_INVALID';
 end if;
 if old.acknowledged_at is not null and new.acknowledged_at is distinct from old.acknowledged_at then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if old.acknowledged_at is null and new.acknowledged_at is not null then return new; end if;
 if old.acknowledged_at is not distinct from new.acknowledged_at then return new; end if;
 raise exception using errcode='22023',message='ORDER_INVALID';
end $$;
create trigger payment_exception_ack before update on public.payment_exceptions for each row execute function public.guard_payment_exception_ack();

create function public.internal_order_operations_record(p_order_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'orderId',o.id,'revision',o.revision,'buyerName',o.buyer_name,'phone',o.phone,'totalVnd',o.total_vnd,'currency',o.currency,
  'fulfilmentStatus',o.fulfilment_status,'paymentStatus',o.payment_status,'reconciliation',o.reconciliation,
  'trackingRef',o.tracking_ref,'customerVisibleProgress',o.customer_visible_progress,'internalNote',o.internal_note,'updatedAt',o.updated_at,
  'items',coalesce((select jsonb_agg(jsonb_build_object('lineNumber',i.line_number,'name',i.name,'sku',i.sku,'quantity',i.quantity,'unitPriceVnd',i.unit_price_vnd,'lineTotalVnd',i.line_total_vnd) order by i.line_number) from public.order_items i where i.order_id=o.id),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(jsonb_build_object('version',h.version,'fulfilmentStatus',h.fulfilment_status,'trackingRef',h.tracking_ref,'customerVisibleProgress',h.customer_visible_progress,'internalNote',h.internal_note,'createdAt',h.created_at) order by h.version desc) from (select * from public.order_fulfilment_history where order_id=o.id order by version desc limit 100) h),'[]'::jsonb)
 ) from public.orders o where o.id=p_order_id
$$;

create function public.list_staff_order_operations(p_organization_id uuid,p_actor_id uuid,p_status text,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in('staff','manager') for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if p_status is null or p_status not in('PREPARING','DELIVERING','DELIVERED') or p_page is null or p_page not between 1 and 10000 then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 select jsonb_build_object(
  'page',p_page,
  'total',(select count(*) from public.orders o where o.organization_id=p_organization_id and o.fulfilment_status=p_status),
  'items',coalesce((select jsonb_agg(x.item) from (
    select jsonb_build_object(
     'orderId',o.id,'revision',o.revision,'buyerName',o.buyer_name,'phone',o.phone,'totalVnd',o.total_vnd,'currency',o.currency,
     'fulfilmentStatus',o.fulfilment_status,'paymentStatus',o.payment_status,'reconciliation',o.reconciliation,
     'trackingRef',o.tracking_ref,'customerVisibleProgress',o.customer_visible_progress,'updatedAt',o.updated_at
    ) item
    from public.orders o
    where o.organization_id=p_organization_id and o.fulfilment_status=p_status
    order by o.updated_at desc,o.id
    limit 20 offset (p_page-1)*20
  ) x),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.read_staff_order_operations(p_organization_id uuid,p_actor_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in('staff','manager') for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if p_order_id is null then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if not exists(select 1 from public.orders where id=p_order_id and organization_id=p_organization_id) then return null; end if;
 return public.internal_order_operations_record(p_order_id);
end $$;

create function public.staff_transition_order(p_organization_id uuid,p_actor_id uuid,p_order_id uuid,p_expected_version integer,p_to text,p_request_id uuid,p_tracking_ref text default null,p_customer_visible_progress text default '',p_internal_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.orders%rowtype; prior public.order_fulfilment_history%rowtype; tracking text; progress text; note text; changed timestamptz:=clock_timestamp();
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in('staff','manager') for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if p_order_id is null or p_request_id is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 or p_to is null or p_to not in('DELIVERING','DELIVERED') then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 progress:=coalesce(p_customer_visible_progress,''); note:=coalesce(p_internal_note,'');
 if length(progress)>4000 or length(note)>4000 then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if (progress||note) ~* '</?[[:alpha:]][^>]*>' or translate(progress||note,E'\n\r\t','') ~ '[[:cntrl:]]' then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if p_tracking_ref is null or btrim(p_tracking_ref)='' then tracking:=null; else tracking:=btrim(p_tracking_ref); end if;
 if tracking is not null and (length(tracking) not between 1 and 80 or tracking ~* '</?[[:alpha:]][^>]*>' or translate(tracking,E'\n\r\t','') ~ '[[:cntrl:]]') then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,250));
 select * into prior from public.order_fulfilment_history where request_id=p_request_id;
 if found then
  if row(prior.organization_id,prior.actor_id,prior.order_id,prior.expected_version,prior.fulfilment_status,prior.tracking_ref,prior.customer_visible_progress,prior.internal_note)
   is distinct from row(p_organization_id,p_actor_id,p_order_id,p_expected_version,p_to,tracking,progress,note) then raise exception using errcode='40001',message='ORDER_REQUEST_CONFLICT'; end if;
  return jsonb_build_object('orderId',prior.order_id,'revision',prior.version,'fulfilmentStatus',prior.fulfilment_status);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,251));
 select * into existing from public.orders where id=p_order_id for update;
 if not found or existing.organization_id<>p_organization_id then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if existing.revision<>p_expected_version then raise exception using errcode='40001',message='ORDER_VERSION_CONFLICT'; end if;
 if not ((existing.fulfilment_status='PREPARING' and p_to='DELIVERING') or (existing.fulfilment_status='DELIVERING' and p_to='DELIVERED'))
  or existing.payment_status<>'PAID' or existing.reconciliation<>'NONE' then raise exception using errcode='22023',message='ORDER_TRANSITION'; end if;
 update public.orders set fulfilment_status=p_to,revision=existing.revision+1,tracking_ref=tracking,customer_visible_progress=progress,internal_note=note,updated_at=changed
  where id=p_order_id;
 insert into public.order_fulfilment_history(request_id,organization_id,order_id,actor_id,expected_version,version,fulfilment_status,tracking_ref,customer_visible_progress,internal_note)
  values(p_request_id,p_organization_id,p_order_id,p_actor_id,p_expected_version,existing.revision+1,p_to,tracking,progress,note);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_organization_id,'staff',p_actor_id,'order.fulfilment_transition','order',p_order_id,'fulfilment.advanced',p_request_id,p_request_id);
 return jsonb_build_object('orderId',p_order_id,'revision',existing.revision+1,'fulfilmentStatus',p_to);
end $$;

create function public.list_payment_exceptions(p_organization_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'orderId',e.order_id,'reason',e.reason,'createdAt',e.created_at,'acknowledgedAt',e.acknowledged_at,
  'buyerName',o.buyer_name,'totalVnd',o.total_vnd,'paymentStatus',o.payment_status,'fulfilmentStatus',o.fulfilment_status,'reconciliation',o.reconciliation
 ) order by e.created_at desc,e.id),'[]'::jsonb) into result
 from public.payment_exceptions e join public.orders o on o.id=e.order_id
 where e.organization_id=p_organization_id;
 return result;
end $$;

create function public.acknowledge_payment_exception(p_organization_id uuid,p_actor_id uuid,p_exception_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.payment_exceptions%rowtype; changed timestamptz:=clock_timestamp();
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if p_exception_id is null or p_request_id is null then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_exception_id::text,252));
 select * into existing from public.payment_exceptions where id=p_exception_id for update;
 if not found or existing.organization_id<>p_organization_id then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if existing.acknowledged_at is not null then return jsonb_build_object('id',existing.id,'acknowledgedAt',existing.acknowledged_at); end if;
 update public.payment_exceptions set acknowledged_at=changed where id=p_exception_id;
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_organization_id,'staff',p_actor_id,'payment.exception_ack','order',existing.order_id,'payment.manual_review',p_request_id,p_request_id);
 return jsonb_build_object('id',p_exception_id,'acknowledgedAt',changed);
end $$;

revoke all on function public.guard_payment_exception_ack(),public.internal_order_operations_record(uuid) from public,anon,authenticated,service_role;
revoke all on function public.list_staff_order_operations(uuid,uuid,text,integer),public.read_staff_order_operations(uuid,uuid,uuid),public.staff_transition_order(uuid,uuid,uuid,integer,text,uuid,text,text,text),public.list_payment_exceptions(uuid,uuid),public.acknowledge_payment_exception(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_staff_order_operations(uuid,uuid,text,integer),public.read_staff_order_operations(uuid,uuid,uuid),public.staff_transition_order(uuid,uuid,uuid,integer,text,uuid,text,text,text),public.list_payment_exceptions(uuid,uuid),public.acknowledge_payment_exception(uuid,uuid,uuid,uuid) to service_role;
