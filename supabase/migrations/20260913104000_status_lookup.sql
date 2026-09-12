-- SPDX-License-Identifier: Apache-2.0
-- OV-027 channel-neutral status lookup. Purpose=status tokens reuse confirmation hash-at-rest.
-- Website session (channel_user_key) is sufficient; Facebook page+psid is adapter-only.
alter table public.order_confirmation_tokens drop constraint order_confirmation_tokens_purpose_check;
alter table public.order_confirmation_tokens add constraint order_confirmation_tokens_purpose_check check(purpose in ('confirmation','status'));

create table public.status_lookup_rate_windows (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 identity_hash text not null check(identity_hash ~ '^[0-9a-f]{64}$'),
 origin_hash text not null check(origin_hash ~ '^[0-9a-f]{64}$'),
 window_started_at timestamptz not null,
 attempt_count integer not null check(attempt_count>=0),
 primary key(organization_id,identity_hash,origin_hash,window_started_at)
);
alter table public.status_lookup_rate_windows enable row level security;
revoke all on public.status_lookup_rate_windows from public,anon,authenticated,service_role;
grant select on public.status_lookup_rate_windows to service_role;
create policy status_lookup_rate_windows_read on public.status_lookup_rate_windows for select to service_role using(true);

create function public.normalize_customer_phone(p_phone text) returns text
language plpgsql immutable set search_path='' as $$
declare digits text;
begin
 if p_phone is null then return null; end if;
 digits:=regexp_replace(p_phone,'[^0-9]','','g');
 if digits like '84%' and char_length(digits)>=10 then digits:=substr(digits,3); end if;
 if left(digits,1)='0' then digits:=substr(digits,2); end if;
 if char_length(digits) between 8 and 12 then return '+84'||digits; end if;
 return null;
end $$;

create function public.internal_public_order_status(p_order_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'asOf',clock_timestamp(),
  'order',jsonb_build_object(
   'orderId',o.id,'fulfilmentStatus',o.fulfilment_status,'paymentStatus',o.payment_status,
   'trackingRef',o.tracking_ref,'customerVisibleProgress',o.customer_visible_progress,
   'currency',o.currency,'totalVnd',o.total_vnd,
   'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'sku',i.sku,'quantity',i.quantity) order by i.line_number) from public.order_items i where i.order_id=o.id),'[]'::jsonb)
  ),
  'warranty',coalesce((select jsonb_agg(jsonb_build_object(
    'id',w.id,'status',w.status,'customerNote',w.customer_note,'updatedAt',w.updated_at,
    'history',coalesce((select jsonb_agg(jsonb_build_object('version',h.version,'status',h.status,'customerNote',h.customer_note,'createdAt',h.created_at) order by h.version desc)
      from (select * from public.warranty_history where case_id=w.id order by version desc limit 100) h),'[]'::jsonb)
   ) order by w.updated_at desc) from public.warranty_cases w where w.order_id=o.id),'[]'::jsonb)
 )
 from public.orders o where o.id=p_order_id
$$;

create or replace function public.verify_customer_order_status(
 p_organization_id uuid,p_conversation_id uuid,p_order_code text,p_phone text,p_origin text,
 p_token_hash text,p_expires_at timestamptz,p_now timestamptz default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; existing public.orders%rowtype; token public.order_confirmation_tokens%rowtype;
 v_now timestamptz:=coalesce(p_now,clock_timestamp()); v_window timestamptz; v_identity text; v_origin text; v_count integer;
 v_phone text; v_order uuid; v_has_conversation boolean; v_unverified jsonb:=jsonb_build_object('ok',false,'code','UNVERIFIED');
begin
 if p_organization_id is null or p_conversation_id is null then return v_unverified; end if;
 v_window:=to_timestamp(floor(extract(epoch from v_now)/600)*600);
 v_origin:=encode(sha256(convert_to(coalesce(p_origin,''),'UTF8')),'hex');
 select * into c from public.conversations where id=p_conversation_id and organization_id=p_organization_id;
 v_has_conversation:=found;
 if v_has_conversation then
  v_identity:=encode(sha256(convert_to(jsonb_build_array(c.organization_id,c.channel,c.channel_user_key)::text,'UTF8')),'hex');
 else
  v_identity:=encode(sha256(convert_to(jsonb_build_array(p_organization_id,'missing',p_conversation_id)::text,'UTF8')),'hex');
 end if;
 insert into public.status_lookup_rate_windows(organization_id,identity_hash,origin_hash,window_started_at,attempt_count)
 values(p_organization_id,v_identity,v_origin,v_window,1)
 on conflict(organization_id,identity_hash,origin_hash,window_started_at)
 do update set attempt_count=public.status_lookup_rate_windows.attempt_count+1
 returning attempt_count into v_count;
 if v_count>5 then return jsonb_build_object('ok',false,'code','RATE_LIMITED'); end if;
 if not v_has_conversation then return v_unverified; end if;
 v_phone:=public.normalize_customer_phone(p_phone);
 if v_phone is null or p_order_code is null or p_order_code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return v_unverified; end if;
 v_order:=lower(p_order_code)::uuid;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at is null or p_expires_at<=v_now or p_expires_at>v_now+interval '1 hour' then return v_unverified; end if;
 select * into existing from public.orders where id=v_order and organization_id=p_organization_id;
 if not found or public.normalize_customer_phone(existing.phone) is distinct from v_phone then return v_unverified; end if;
 if existing.conversation_id is null then return jsonb_build_object('ok',false,'code','HANDOFF'); end if;
 if existing.conversation_id is distinct from c.id then return v_unverified; end if;
 if c.channel='WEB' and (c.page_id is not null or c.psid is not null) then return v_unverified; end if;
 if c.channel='FACEBOOK' and (c.page_id is null or c.psid is null) then return v_unverified; end if;
 select * into token from public.order_confirmation_tokens where token_hash=p_token_hash;
 if found then
  if token.purpose is distinct from 'status' or token.organization_id is distinct from p_organization_id or token.order_id is distinct from existing.id then return v_unverified; end if;
  return jsonb_build_object('ok',true,'status',public.internal_public_order_status(existing.id),'expiresAt',token.expires_at);
 end if;
 insert into public.order_confirmation_tokens(token_hash,organization_id,order_id,purpose,request_id,expires_at)
 values(p_token_hash,p_organization_id,existing.id,'status',gen_random_uuid(),p_expires_at);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'system','order.status_token_issued','order',existing.id,'status.issued',p_conversation_id,gen_random_uuid());
 return jsonb_build_object('ok',true,'status',public.internal_public_order_status(existing.id),'expiresAt',p_expires_at);
end $$;

create function public.read_order_status(p_token_hash text,p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token public.order_confirmation_tokens%rowtype; v_now timestamptz:=coalesce(p_now,clock_timestamp());
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into token from public.order_confirmation_tokens where token_hash=p_token_hash;
 if not found or token.purpose<>'status' or token.expires_at<=v_now then return null; end if;
 return public.internal_public_order_status(token.order_id);
end $$;

revoke all on function public.normalize_customer_phone(text),public.internal_public_order_status(uuid) from public,anon,authenticated,service_role;
revoke all on function public.verify_customer_order_status(uuid,uuid,text,text,text,text,timestamptz,timestamptz),public.read_order_status(text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.normalize_customer_phone(text),public.verify_customer_order_status(uuid,uuid,text,text,text,text,timestamptz,timestamptz),public.read_order_status(text,timestamptz) to service_role;
