-- SPDX-License-Identifier: Apache-2.0
-- Customer confirmation tokens and manager shipping fee. Confirm does not pay, reserve, or freeze.
create table public.order_confirmation_tokens (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 purpose text not null check(purpose='confirmation'),
 request_id uuid not null unique,
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp()
);
create index order_confirmation_tokens_order_idx on public.order_confirmation_tokens(order_id,expires_at);
create table public.order_confirmation_quotes (
 request_id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null references public.orders(id) on delete restrict,
 revision integer not null check(revision>0),
 quote jsonb not null,
 confirmed_at timestamptz not null default clock_timestamp()
);
create unique index order_confirmation_one_revision on public.order_confirmation_quotes(order_id,revision);
create table public.order_shipping_setting_requests (
 request_id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 expected_revision integer not null,
 flat_fee_vnd bigint not null check(flat_fee_vnd between 0 and 9007199254740991),
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create trigger order_confirmation_tokens_no_change before update or delete on public.order_confirmation_tokens for each row execute function public.reject_audit_mutation();
create trigger order_confirmation_quotes_no_change before update or delete on public.order_confirmation_quotes for each row execute function public.reject_audit_mutation();
create trigger order_shipping_setting_requests_no_change before update or delete on public.order_shipping_setting_requests for each row execute function public.reject_audit_mutation();
alter table public.order_confirmation_tokens enable row level security;
alter table public.order_confirmation_quotes enable row level security;
alter table public.order_shipping_setting_requests enable row level security;
revoke all on public.order_confirmation_tokens,public.order_confirmation_quotes,public.order_shipping_setting_requests from public,anon,authenticated,service_role;
grant select on public.order_confirmation_tokens,public.order_confirmation_quotes,public.order_shipping_setting_requests to service_role;
create policy order_confirmation_tokens_read on public.order_confirmation_tokens for select to service_role using(true);
create policy order_confirmation_quotes_read on public.order_confirmation_quotes for select to service_role using(true);
create policy order_shipping_setting_requests_read on public.order_shipping_setting_requests for select to service_role using(true);

create or replace function public.issue_order_confirmation_token(p_organization_id uuid,p_owner_id uuid,p_conversation_id uuid,p_order_id uuid,p_request_id uuid,p_expected_revision integer,p_document jsonb,p_token_hash text,p_purpose text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.orders%rowtype; token public.order_confirmation_tokens%rowtype; saved jsonb; target uuid; expected integer;
begin
 if p_owner_id is null or p_conversation_id is null or p_request_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_purpose is distinct from 'confirmation' or p_expires_at is null or p_expires_at<=clock_timestamp() then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 if p_document is null or p_document->>'buyerName' is null or p_document->>'phone' is null or p_document->'address'='null'::jsonb then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,22));
 select * into token from public.order_confirmation_tokens where request_id=p_request_id;
 if found then
  if token.token_hash is distinct from p_token_hash or token.organization_id is distinct from p_organization_id or token.purpose is distinct from p_purpose then raise exception using errcode='40001',message='ORDER_REQUEST_CONFLICT'; end if;
  return jsonb_build_object('orderId',token.order_id,'revision',(select revision from public.orders where id=token.order_id),'expiresAt',token.expires_at);
 end if;
 perform 1 from public.conversations where id=p_conversation_id and organization_id=p_organization_id for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 select * into existing from public.orders where organization_id=p_organization_id and conversation_id=p_conversation_id and created_by_kind='system' and automation_owner_id=p_owner_id for update;
 if found then target:=existing.id; expected:=existing.revision; else target:=coalesce(p_order_id,gen_random_uuid()); expected:=0; end if;
 saved:=public.save_automation_order_draft(p_organization_id,p_owner_id,p_conversation_id,target,p_request_id,expected,p_document);
 insert into public.order_confirmation_tokens(token_hash,organization_id,order_id,purpose,request_id,expires_at) values(p_token_hash,p_organization_id,(saved->>'orderId')::uuid,'confirmation',p_request_id,p_expires_at);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'system','order.confirmation_token_issued','order',(saved->>'orderId')::uuid,'confirmation.issued',p_request_id,gen_random_uuid());
 return jsonb_build_object('orderId',saved->>'orderId','revision',saved->'revision','expiresAt',p_expires_at);
end $$;

create function public.read_order_confirmation(p_token_hash text,p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token public.order_confirmation_tokens%rowtype;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into token from public.order_confirmation_tokens where token_hash=p_token_hash;
 if not found or token.purpose<>'confirmation' or token.expires_at<=clock_timestamp() then return null; end if;
 return public.internal_order_snapshot(token.organization_id,token.order_id);
end $$;

create function public.save_customer_order_draft(p_token_hash text,p_request_id uuid,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token public.order_confirmation_tokens%rowtype; existing public.orders%rowtype;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_request_id is null then return null; end if;
 select * into token from public.order_confirmation_tokens where token_hash=p_token_hash for update;
 if not found or token.purpose<>'confirmation' or token.expires_at<=clock_timestamp() then return null; end if;
 select * into existing from public.orders where id=token.order_id for update;
 if not found or existing.fulfilment_status<>'DRAFT' or existing.checkout_frozen_at is not null then raise exception using errcode='55000',message='ORDER_FROZEN'; end if;
 perform public.save_automation_order_draft(existing.organization_id,existing.automation_owner_id,existing.conversation_id,existing.id,p_request_id,existing.revision,p_document);
 return public.internal_order_snapshot(existing.organization_id,existing.id);
end $$;

create function public.confirm_order_quote(p_token_hash text,p_request_id uuid,p_expected_quote jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token public.order_confirmation_tokens%rowtype; existing public.orders%rowtype; shipping public.order_shipping_settings%rowtype;
 item record; product public.products%rowtype; variant public.product_variants%rowtype; current jsonb; prior public.order_confirmation_quotes%rowtype;
 subtotal numeric:=0; price bigint; changed boolean:=false;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_request_id is null then return null; end if;
 select * into token from public.order_confirmation_tokens where token_hash=p_token_hash for update;
 if not found or token.purpose<>'confirmation' or token.expires_at<=clock_timestamp() then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,23));
 select * into prior from public.order_confirmation_quotes where request_id=p_request_id;
 if found then return jsonb_build_object('status','confirmed','quote',prior.quote); end if;
 select * into existing from public.orders where id=token.order_id for update;
 if not found or existing.fulfilment_status<>'DRAFT' then return null; end if;
 select * into shipping from public.order_shipping_settings where organization_id=existing.organization_id for share;
 current:=public.internal_order_snapshot(existing.organization_id,existing.id);
 if shipping.organization_id is null or shipping.flat_fee_vnd is null then
  return jsonb_build_object('status','blocked','code','ORDER_SHIPPING_UNKNOWN','quote',current);
 end if;
 perform 1 from public.products where id in(select product_id from public.order_items where order_id=existing.id) order by id for share;
 for item in select * from public.order_items where order_id=existing.id order by line_number loop
  select * into product from public.products where id=item.product_id and organization_id=existing.organization_id and disabled_at is null;
  if not found then raise exception using errcode='22023',message='ORDER_PRODUCT_UNAVAILABLE'; end if;
  if item.variant_id is null then
   if exists(select 1 from public.product_variants where product_id=item.product_id) then raise exception using errcode='22023',message='ORDER_VARIANT_REQUIRED'; end if;
   price:=product.price_vnd;
  else
   select * into variant from public.product_variants where id=item.variant_id and product_id=item.product_id and disabled_at is null for share;
   if not found then raise exception using errcode='22023',message='ORDER_PRODUCT_UNAVAILABLE'; end if;
   price:=variant.price_vnd;
  end if;
  if price is null or price<0 then raise exception using errcode='22023',message='ORDER_PRICE_UNKNOWN'; end if;
  if price is distinct from item.unit_price_vnd or product.version is distinct from item.product_version then changed:=true; end if;
  subtotal:=subtotal+price::numeric*item.quantity;
 end loop;
 if existing.shipping_fee_vnd is distinct from shipping.flat_fee_vnd or existing.shipping_revision is distinct from shipping.revision then changed:=true; end if;
 if changed or existing.subtotal_vnd is distinct from subtotal::bigint then
  update public.order_items i set unit_price_vnd=coalesce((select v.price_vnd from public.product_variants v where v.id=i.variant_id),(select p.price_vnd from public.products p where p.id=i.product_id)),
   product_version=(select p.version from public.products p where p.id=i.product_id),
   line_total_vnd=i.quantity*coalesce((select v.price_vnd from public.product_variants v where v.id=i.variant_id),(select p.price_vnd from public.products p where p.id=i.product_id))
  where i.order_id=existing.id;
  update public.orders set subtotal_vnd=subtotal::bigint,shipping_fee_vnd=shipping.flat_fee_vnd,shipping_revision=shipping.revision,total_vnd=(subtotal+shipping.flat_fee_vnd)::bigint,revision=revision+1,updated_at=clock_timestamp() where id=existing.id;
  current:=public.internal_order_snapshot(existing.organization_id,existing.id);
 end if;
 if (p_expected_quote->>'orderVersion')::integer is distinct from (current->>'revision')::integer
  or (p_expected_quote->>'subtotalVnd')::bigint is distinct from (current->>'subtotalVnd')::bigint
  or (p_expected_quote->>'shippingFeeVnd')::bigint is distinct from (current->>'shippingFeeVnd')::bigint
  or (p_expected_quote->>'totalVnd')::bigint is distinct from (current->>'totalVnd')::bigint then
  return jsonb_build_object('status','changed','quote',current);
 end if;
 if existing.fulfilment_status<>'DRAFT' or existing.payment_status<>'UNPAID' or existing.checkout_frozen_at is not null then raise exception using errcode='55000',message='ORDER_FROZEN'; end if;
 insert into public.order_confirmation_quotes(request_id,organization_id,order_id,revision,quote) values(p_request_id,existing.organization_id,existing.id,(current->>'revision')::integer,current);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(existing.organization_id,'system','order.quote_confirmed','order',existing.id,'confirmation.confirmed',p_request_id,p_request_id);
 return jsonb_build_object('status','confirmed','quote',current);
end $$;

create function public.read_confirmed_order_quote(p_organization_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.orders%rowtype;
begin
 select * into existing from public.orders where id=p_order_id and organization_id=p_organization_id;
 if not found then return null; end if;
 return (select quote from public.order_confirmation_quotes where order_id=existing.id and revision=existing.revision);
end $$;

create function public.read_order_shipping_settings(p_organization_id uuid,p_actor_id uuid,p_role text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare shipping public.order_shipping_settings%rowtype;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 select * into shipping from public.order_shipping_settings where organization_id=p_organization_id;
 if not found then return jsonb_build_object('revision',1,'flatFeeVnd',null); end if;
 return jsonb_build_object('revision',shipping.revision,'flatFeeVnd',shipping.flat_fee_vnd);
end $$;

create function public.save_order_shipping_settings(p_organization_id uuid,p_actor_id uuid,p_request_id uuid,p_expected_revision integer,p_flat_fee_vnd bigint,p_role text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare shipping public.order_shipping_settings%rowtype; receipt public.order_shipping_setting_requests%rowtype; result jsonb;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception using errcode='42501',message='ORDER_FORBIDDEN'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_flat_fee_vnd is null or p_flat_fee_vnd<0 then raise exception using errcode='22023',message='ORDER_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,24));
 select * into receipt from public.order_shipping_setting_requests where request_id=p_request_id;
 if found then
  if row(receipt.organization_id,receipt.actor_id,receipt.expected_revision,receipt.flat_fee_vnd) is distinct from row(p_organization_id,p_actor_id,p_expected_revision,p_flat_fee_vnd) then raise exception using errcode='40001',message='ORDER_REQUEST_CONFLICT'; end if;
  return receipt.result;
 end if;
 insert into public.order_shipping_settings(organization_id,flat_fee_vnd) values(p_organization_id,p_flat_fee_vnd)
 on conflict(organization_id) do update set flat_fee_vnd=excluded.flat_fee_vnd where public.order_shipping_settings.revision=p_expected_revision;
 select * into shipping from public.order_shipping_settings where organization_id=p_organization_id;
 if not found or shipping.flat_fee_vnd is distinct from p_flat_fee_vnd then raise exception using errcode='40001',message='ORDER_VERSION_CONFLICT'; end if;
 result:=jsonb_build_object('revision',shipping.revision,'flatFeeVnd',shipping.flat_fee_vnd);
 insert into public.order_shipping_setting_requests(request_id,organization_id,actor_id,expected_revision,flat_fee_vnd,result) values(p_request_id,p_organization_id,p_actor_id,p_expected_revision,p_flat_fee_vnd,result);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'order.shipping_settings_saved','organization',p_organization_id,'shipping.configured',p_request_id,p_request_id);
 return result;
end $$;

revoke all on function public.issue_order_confirmation_token(uuid,uuid,uuid,uuid,uuid,integer,jsonb,text,text,timestamptz),public.read_order_confirmation(text,timestamptz),public.save_customer_order_draft(text,uuid,jsonb),public.confirm_order_quote(text,uuid,jsonb),public.read_confirmed_order_quote(uuid,uuid),public.read_order_shipping_settings(uuid,uuid,text),public.save_order_shipping_settings(uuid,uuid,uuid,integer,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_order_confirmation_token(uuid,uuid,uuid,uuid,uuid,integer,jsonb,text,text,timestamptz),public.read_order_confirmation(text,timestamptz),public.save_customer_order_draft(text,uuid,jsonb),public.confirm_order_quote(text,uuid,jsonb),public.read_confirmed_order_quote(uuid,uuid),public.read_order_shipping_settings(uuid,uuid,text),public.save_order_shipping_settings(uuid,uuid,uuid,integer,bigint,text) to service_role;
