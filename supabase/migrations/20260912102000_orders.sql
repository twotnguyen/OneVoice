-- SPDX-License-Identifier: Apache-2.0
-- Native drafts only. No holds, checkout route, payment dispatch or fulfilment automation.
create table public.order_shipping_settings (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 flat_fee_vnd bigint check(flat_fee_vnd between 0 and 9007199254740991),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp()
);
create function public.bump_order_shipping_revision() returns trigger language plpgsql set search_path='' as $$ begin
 if new.organization_id<>old.organization_id then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 new.revision:=old.revision+1; new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger order_shipping_revision before update on public.order_shipping_settings for each row execute function public.bump_order_shipping_revision();

create table public.orders (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 revision integer not null default 1 check(revision>0),
 created_by_kind text not null check(created_by_kind in('staff','system')),
 created_by_actor_id uuid,
 automation_owner_id uuid,
 conversation_id uuid references public.conversations(id) on delete restrict,
 buyer_name text check(buyer_name is null or length(trim(buyer_name)) between 1 and 200),
 phone text check(phone is null or phone ~ '^\+?[0-9]{8,15}$'),
 address jsonb,
 currency text not null default 'VND' check(currency='VND'),
 subtotal_vnd bigint not null check(subtotal_vnd between 0 and 9007199254740991),
 shipping_fee_vnd bigint check(shipping_fee_vnd between 0 and 9007199254740991),
 shipping_revision integer check(shipping_revision>0),
 total_vnd bigint check(total_vnd between 0 and 9007199254740991),
 fulfilment_status text not null default 'DRAFT' check(fulfilment_status in('DRAFT','AWAITING_PAYMENT','PREPARING','DELIVERING','DELIVERED','EXPIRED','CANCELLED')),
 payment_status text not null default 'UNPAID' check(payment_status in('UNPAID','FAILED','PAID')),
 reservation_id uuid, payment_id uuid, fulfilment_id uuid,
 checkout_frozen_at timestamptz, checkout_snapshot jsonb, checkout_request_id uuid unique,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check((shipping_fee_vnd is null and total_vnd is null) or (shipping_fee_vnd is not null and total_vnd is not null and total_vnd::numeric=subtotal_vnd::numeric+shipping_fee_vnd::numeric)),
 check((created_by_kind='staff' and created_by_actor_id is not null and automation_owner_id is null) or (created_by_kind='system' and created_by_actor_id is null and automation_owner_id is not null)),
 check((checkout_frozen_at is null and checkout_snapshot is null and checkout_request_id is null) or (checkout_frozen_at is not null and checkout_snapshot is not null and checkout_request_id is not null)),
 check(fulfilment_status='DRAFT' or checkout_frozen_at is not null)
);
create index orders_scope_created_idx on public.orders(organization_id,created_at desc,id);
create index orders_conversation_idx on public.orders(organization_id,conversation_id) where conversation_id is not null;
create table public.order_items (
 order_id uuid not null references public.orders(id) on delete restrict,
 line_number integer not null check(line_number between 1 and 100),
 product_id uuid not null references public.products(id) on delete restrict,
 variant_id uuid references public.product_variants(id) on delete restrict,
 product_version integer not null check(product_version>0),
 name text not null, sku text,
 quantity integer not null check(quantity between 1 and 10000),
 unit_price_vnd bigint not null check(unit_price_vnd between 0 and 9007199254740991),
 line_total_vnd bigint not null check(line_total_vnd between 0 and 9007199254740991 and line_total_vnd::numeric=quantity::numeric*unit_price_vnd::numeric),
 source_name text, source_url text,
 primary key(order_id,line_number)
);
create unique index order_items_sku_unique on public.order_items(order_id,product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.order_draft_requests (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id), order_id uuid not null references public.orders(id),
 actor_kind text not null, actor_id uuid, owner_id uuid, conversation_id uuid, expected_revision integer not null,
 document jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create trigger order_requests_no_change before update or delete on public.order_draft_requests for each row execute function public.reject_audit_mutation();
create trigger order_requests_no_truncate before truncate on public.order_draft_requests for each statement execute function public.reject_audit_mutation();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_draft_requests enable row level security;
alter table public.order_shipping_settings enable row level security;
revoke all on public.orders,public.order_items,public.order_draft_requests,public.order_shipping_settings from public,anon,authenticated,service_role;
grant select on public.orders,public.order_items,public.order_draft_requests,public.order_shipping_settings to service_role;
-- OV-021 supplies the manager-only audited configuration path; NULL is not free shipping.
grant insert(organization_id,flat_fee_vnd),update(flat_fee_vnd) on public.order_shipping_settings to service_role;
create policy orders_server_read on public.orders for select to service_role using(true);
create policy order_items_server_read on public.order_items for select to service_role using(true);
create policy order_requests_server_read on public.order_draft_requests for select to service_role using(true);
create policy order_shipping_server on public.order_shipping_settings for all to service_role using(true) with check(true);

create function public.guard_frozen_order() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' then if old.checkout_frozen_at is not null then raise exception using errcode='55000',message='ORDER_FROZEN'; end if; return old; end if;
 if row(new.id,new.organization_id,new.created_by_kind,new.created_by_actor_id,new.automation_owner_id,new.conversation_id) is distinct from row(old.id,old.organization_id,old.created_by_kind,old.created_by_actor_id,old.automation_owner_id,old.conversation_id) then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if old.checkout_frozen_at is not null and row(new.buyer_name,new.phone,new.address,new.currency,new.subtotal_vnd,new.shipping_fee_vnd,new.shipping_revision,new.total_vnd,new.checkout_frozen_at,new.checkout_snapshot,new.checkout_request_id) is distinct from row(old.buyer_name,old.phone,old.address,old.currency,old.subtotal_vnd,old.shipping_fee_vnd,old.shipping_revision,old.total_vnd,old.checkout_frozen_at,old.checkout_snapshot,old.checkout_request_id) then raise exception using errcode='55000',message='ORDER_FROZEN'; end if;
 return new;
end $$;
create trigger frozen_order_guard before update or delete on public.orders for each row execute function public.guard_frozen_order();
create function public.guard_frozen_order_item() returns trigger language plpgsql set search_path='' as $$ declare target uuid; frozen timestamptz; begin
 if tg_op='UPDATE' and new.order_id<>old.order_id then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 target:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 select checkout_frozen_at into frozen from public.orders where id=target for update;
 if frozen is not null then raise exception using errcode='55000',message='ORDER_FROZEN'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger frozen_order_item_guard before insert or update or delete on public.order_items for each row execute function public.guard_frozen_order_item();

create function public.internal_order_snapshot(p_organization_id uuid,p_order_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('orderId',o.id,'organizationId',o.organization_id,'revision',o.revision,'currency',o.currency,'buyerName',o.buyer_name,'phone',o.phone,'address',o.address,'subtotalVnd',o.subtotal_vnd,'shippingFeeVnd',o.shipping_fee_vnd,'shippingRevision',o.shipping_revision,'totalVnd',o.total_vnd,'fulfilmentStatus',o.fulfilment_status,'paymentStatus',o.payment_status,'checkoutFrozenAt',o.checkout_frozen_at,'conversationId',o.conversation_id,'reservationId',o.reservation_id,'paymentId',o.payment_id,'fulfilmentId',o.fulfilment_id,
 'items',coalesce((select jsonb_agg(jsonb_build_object('productId',i.product_id,'variantId',i.variant_id,'productVersion',i.product_version,'name',i.name,'sku',i.sku,'quantity',i.quantity,'unitPriceVnd',i.unit_price_vnd,'lineTotalVnd',i.line_total_vnd,'sourceName',i.source_name,'sourceUrl',i.source_url) order by i.line_number) from public.order_items i where i.order_id=o.id),'[]'::jsonb)) from public.orders o where o.id=p_order_id and o.organization_id=p_organization_id
$$;

create function public.internal_save_order_draft(p_organization_id uuid,p_actor_kind text,p_actor_id uuid,p_owner_id uuid,p_conversation_id uuid,p_order_id uuid,p_request_id uuid,p_expected_revision integer,p_document jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare existing public.orders%rowtype; receipt public.order_draft_requests%rowtype; product public.products%rowtype; variant public.product_variants%rowtype; shipping public.order_shipping_settings%rowtype;
 item jsonb; line_number integer:=0; quantity integer; price bigint; subtotal numeric:=0; line_total numeric; next_revision integer; result jsonb; sku text; item_name text;
begin
 if p_order_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if p_conversation_id is not null then perform 1 from public.conversations where id=p_conversation_id and organization_id=p_organization_id for share; if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,20));
 select * into receipt from public.order_draft_requests where request_id=p_request_id;
 if found then
  if row(receipt.organization_id,receipt.order_id,receipt.actor_kind,receipt.actor_id,receipt.owner_id,receipt.conversation_id,receipt.expected_revision,receipt.document) is distinct from row(p_organization_id,p_order_id,p_actor_kind,p_actor_id,p_owner_id,p_conversation_id,p_expected_revision,p_document) then raise exception using errcode='40001',message='ORDER_REQUEST_CONFLICT'; end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,21));
 select * into existing from public.orders where id=p_order_id for update;
 if found then
  if existing.organization_id<>p_organization_id or (p_actor_kind='system' and (existing.created_by_kind<>'system' or existing.automation_owner_id is distinct from p_owner_id or existing.conversation_id is distinct from p_conversation_id)) then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
  if existing.revision<>p_expected_revision then raise exception using errcode='40001',message='ORDER_VERSION_CONFLICT'; end if;
  if existing.checkout_frozen_at is not null or existing.fulfilment_status<>'DRAFT' then raise exception using errcode='55000',message='ORDER_FROZEN'; end if;
  next_revision:=existing.revision+1;
 else
  if p_expected_revision<>0 then raise exception using errcode='40001',message='ORDER_VERSION_CONFLICT'; end if;
  next_revision:=1;
 end if;
 if p_document is null or jsonb_typeof(p_document)<>'object' or not(p_document ?& array['buyerName','phone','address','items']) or (p_document-array['buyerName','phone','address','items'])<>'{}'::jsonb or jsonb_typeof(p_document->'items')<>'array' then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if (p_document->>'buyerName' is not null and (jsonb_typeof(p_document->'buyerName')<>'string' or length(trim(p_document->>'buyerName')) not between 1 and 200)) or (p_document->>'phone' is not null and (jsonb_typeof(p_document->'phone')<>'string' or p_document->>'phone' !~ '^\+?[0-9]{8,15}$')) then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if p_document->'address'<>'null'::jsonb and (jsonb_typeof(p_document->'address')<>'object' or not((p_document->'address') ?& array['line1','ward','district','province','countryCode']) or ((p_document->'address')-array['line1','ward','district','province','countryCode'])<>'{}'::jsonb
  or jsonb_typeof(p_document->'address'->'line1') is distinct from 'string' or jsonb_typeof(p_document->'address'->'province') is distinct from 'string' or jsonb_typeof(p_document->'address'->'countryCode') is distinct from 'string'
  or length(trim(p_document->'address'->>'line1')) not between 1 and 300 or length(trim(p_document->'address'->>'province')) not between 1 and 120 or p_document->'address'->>'countryCode' !~ '^[A-Z]{2}$'
  or exists(select 1 from jsonb_each(p_document->'address') field where field.key in('ward','district') and field.value<>'null'::jsonb and (jsonb_typeof(field.value)<>'string' or length(trim(field.value#>>'{}')) not between 1 and 120))) then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if jsonb_array_length(p_document->'items') not between 1 and 100 then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_document->'items') i where jsonb_typeof(i)<>'object' or not(i ?& array['productId','variantId','quantity']) or (i-array['productId','variantId','quantity'])<>'{}'::jsonb or jsonb_typeof(i->'quantity')<>'number' or i->>'quantity' !~ '^[0-9]+$' or (i->>'quantity')::numeric not between 1 and 10000) then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if (select count(*)<>count(distinct ((i->>'productId')::uuid,coalesce((i->>'variantId')::uuid,'00000000-0000-0000-0000-000000000000'::uuid))) from jsonb_array_elements(p_document->'items') i) then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 -- Catalog management serializes through parent rows before changing child prices.
 perform 1 from public.products where id in(select (i->>'productId')::uuid from jsonb_array_elements(p_document->'items') i) order by id for share;
 select * into shipping from public.order_shipping_settings where organization_id=p_organization_id for share;
 insert into public.orders(id,organization_id,created_by_kind,created_by_actor_id,automation_owner_id,conversation_id,subtotal_vnd) values(p_order_id,p_organization_id,p_actor_kind,p_actor_id,p_owner_id,p_conversation_id,0) on conflict(id) do nothing;
 delete from public.order_items where order_id=p_order_id;
 for item in select value from jsonb_array_elements(p_document->'items') loop
  select * into product from public.products where id=(item->>'productId')::uuid and organization_id=p_organization_id and disabled_at is null;
  if not found or product.currency<>'VND' then raise exception using errcode='22023',message='ORDER_PRODUCT_UNAVAILABLE'; end if;
  quantity:=(item->>'quantity')::integer;
  if item->>'variantId' is null then
   if exists(select 1 from public.product_variants where product_id=product.id) then raise exception using errcode='22023',message='ORDER_VARIANT_REQUIRED'; end if;
   price:=product.price_vnd; sku:=product.sku; item_name:=product.name;
  else
   select * into variant from public.product_variants where id=(item->>'variantId')::uuid and product_id=product.id and disabled_at is null for share;
   if not found then raise exception using errcode='22023',message='ORDER_PRODUCT_UNAVAILABLE'; end if;
   price:=variant.price_vnd; sku:=variant.sku; item_name:=product.name||case when coalesce(variant.name,'')<>'' then ' / '||variant.name else '' end;
  end if;
  if price is null or price<0 then raise exception using errcode='22023',message='ORDER_PRICE_UNKNOWN'; end if;
  line_total:=price::numeric*quantity; subtotal:=subtotal+line_total;
  if subtotal>9007199254740991 then raise exception using errcode='22023',message='ORDER_AMOUNT_OVERFLOW'; end if;
  line_number:=line_number+1;
  insert into public.order_items(order_id,line_number,product_id,variant_id,product_version,name,sku,quantity,unit_price_vnd,line_total_vnd,source_name,source_url) values(p_order_id,line_number,product.id,(item->>'variantId')::uuid,product.version,item_name,sku,quantity,price,line_total::bigint,product.source_name,product.source_url);
 end loop;
 if shipping.flat_fee_vnd is not null and subtotal+shipping.flat_fee_vnd>9007199254740991 then raise exception using errcode='22023',message='ORDER_AMOUNT_OVERFLOW'; end if;
 update public.orders set buyer_name=case when p_document->>'buyerName' is null then null else trim(p_document->>'buyerName') end,phone=p_document->>'phone',address=nullif(p_document->'address','null'::jsonb),subtotal_vnd=subtotal::bigint,shipping_fee_vnd=shipping.flat_fee_vnd,shipping_revision=shipping.revision,total_vnd=case when shipping.flat_fee_vnd is null then null else (subtotal+shipping.flat_fee_vnd)::bigint end,revision=next_revision,updated_at=clock_timestamp() where id=p_order_id;
 result:=jsonb_build_object('orderId',p_order_id,'revision',next_revision);
 insert into public.order_draft_requests(request_id,organization_id,order_id,actor_kind,actor_id,owner_id,conversation_id,expected_revision,document,result) values(p_request_id,p_organization_id,p_order_id,p_actor_kind,p_actor_id,p_owner_id,p_conversation_id,p_expected_revision,p_document,result);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key) values(p_organization_id,p_actor_kind,p_actor_id,'order.draft_saved','order',p_order_id,'draft.saved',p_request_id,p_request_id);
 return result;
end $$;

create function public.save_staff_order_draft(p_organization_id uuid,p_actor_id uuid,p_order_id uuid,p_request_id uuid,p_expected_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in('manager','staff') for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 return public.internal_save_order_draft(p_organization_id,'staff',p_actor_id,null,null,p_order_id,p_request_id,p_expected_revision,p_document);
end $$;
create function public.save_automation_order_draft(p_organization_id uuid,p_owner_id uuid,p_conversation_id uuid,p_order_id uuid,p_request_id uuid,p_expected_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if p_owner_id is null then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 return public.internal_save_order_draft(p_organization_id,'system',null,p_owner_id,p_conversation_id,p_order_id,p_request_id,p_expected_revision,p_document);
end $$;
create function public.read_staff_order(p_organization_id uuid,p_actor_id uuid,p_order_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in('manager','staff') for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 return public.internal_order_snapshot(p_organization_id,p_order_id);
end $$;
create function public.read_automation_order(p_organization_id uuid,p_owner_id uuid,p_order_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if p_owner_id is null or not exists(select 1 from public.orders where id=p_order_id and organization_id=p_organization_id and automation_owner_id=p_owner_id and created_by_kind='system') then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 return public.internal_order_snapshot(p_organization_id,p_order_id);
end $$;

-- Integration-only helper: no direct service-role EXECUTE. OV-021/022 must invoke
-- from their authorized transaction alongside fresh inventory checks and the hold.
create function public.freeze_order_checkout_snapshot(p_organization_id uuid,p_order_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb language plpgsql set search_path='' as $$
declare existing public.orders%rowtype; shipping public.order_shipping_settings%rowtype; item record; product public.products%rowtype; variant public.product_variants%rowtype; frozen timestamptz:=clock_timestamp(); snapshot jsonb;
begin
 select * into existing from public.orders where id=p_order_id and organization_id=p_organization_id for update;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if p_request_id is null then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if existing.checkout_frozen_at is not null then
  if existing.checkout_request_id=p_request_id then return existing.checkout_snapshot; end if;
  raise exception using errcode='55000',message='ORDER_FROZEN';
 end if;
 if existing.revision is distinct from p_expected_revision or existing.fulfilment_status<>'DRAFT' then raise exception using errcode='40001',message='ORDER_VERSION_CONFLICT'; end if;
 if existing.buyer_name is null or existing.phone is null or existing.address is null then raise exception using errcode='22023',message='ORDER_BUYER_INCOMPLETE'; end if;
 select * into shipping from public.order_shipping_settings where organization_id=p_organization_id for share;
 if not found or shipping.flat_fee_vnd is null then raise exception using errcode='22023',message='ORDER_SHIPPING_UNKNOWN'; end if;
 if existing.shipping_fee_vnd is distinct from shipping.flat_fee_vnd or existing.shipping_revision is distinct from shipping.revision then raise exception using errcode='40001',message='ORDER_SHIPPING_CHANGED'; end if;
 if existing.total_vnd is null or existing.total_vnd<=0 then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform 1 from public.products where id in(select product_id from public.order_items where order_id=p_order_id) order by id for share;
 for item in select * from public.order_items where order_id=p_order_id order by line_number loop
  select * into product from public.products where id=item.product_id and organization_id=p_organization_id and disabled_at is null;
  if not found or product.version<>item.product_version or product.currency<>'VND' then raise exception using errcode='40001',message='ORDER_CATALOG_CHANGED'; end if;
  if item.variant_id is null then
   if exists(select 1 from public.product_variants where product_id=item.product_id) or product.price_vnd is distinct from item.unit_price_vnd then raise exception using errcode='40001',message='ORDER_CATALOG_CHANGED'; end if;
  else
   select * into variant from public.product_variants where id=item.variant_id and product_id=item.product_id and disabled_at is null for share;
   if not found or variant.price_vnd is distinct from item.unit_price_vnd then raise exception using errcode='40001',message='ORDER_CATALOG_CHANGED'; end if;
  end if;
 end loop;
 snapshot:=public.internal_order_snapshot(p_organization_id,p_order_id)||jsonb_build_object('revision',existing.revision+1,'checkoutFrozenAt',frozen);
 update public.orders set checkout_frozen_at=frozen,checkout_snapshot=snapshot,checkout_request_id=p_request_id,revision=existing.revision+1,updated_at=frozen where id=p_order_id;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key) values(p_organization_id,'system','order.snapshot_frozen','order',p_order_id,'checkout.snapshot',p_request_id,p_request_id);
 return snapshot;
end $$;

revoke all on function public.bump_order_shipping_revision(),public.guard_frozen_order(),public.guard_frozen_order_item(),public.internal_order_snapshot(uuid,uuid),public.internal_save_order_draft(uuid,text,uuid,uuid,uuid,uuid,uuid,integer,jsonb),public.freeze_order_checkout_snapshot(uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.save_staff_order_draft(uuid,uuid,uuid,uuid,integer,jsonb),public.save_automation_order_draft(uuid,uuid,uuid,uuid,uuid,integer,jsonb),public.read_staff_order(uuid,uuid,uuid),public.read_automation_order(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_staff_order_draft(uuid,uuid,uuid,uuid,integer,jsonb),public.save_automation_order_draft(uuid,uuid,uuid,uuid,uuid,integer,jsonb),public.read_staff_order(uuid,uuid,uuid),public.read_automation_order(uuid,uuid,uuid) to service_role;
