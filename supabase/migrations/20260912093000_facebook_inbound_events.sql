-- SPDX-License-Identifier: Apache-2.0
-- Normalized inbox only; raw webhook bodies/signatures/secrets are never stored.
create table public.facebook_inbound_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 page_id text not null check (page_id ~ '^[0-9]{1,32}$'),
 provider_key text not null check (char_length(provider_key) between 1 and 320),
 kind text not null check (kind in ('message','echo','postback','referral','comment','feed')),
 sender_id text check (char_length(sender_id) between 1 and 256),
 recipient_id text check (char_length(recipient_id) between 1 and 256),
 event_time_ms bigint check (event_time_ms >= 0 and event_time_ms <= 8640000000000000),
 delivery_time_ms bigint check (delivery_time_ms >= 0 and delivery_time_ms <= 8640000000000000),
 data jsonb not null check (jsonb_typeof(data)='object' and octet_length(data::text)<=65536),
 received_at timestamptz not null default clock_timestamp(),
 unique(organization_id,page_id,provider_key)
);
create index facebook_inbound_events_timeline_idx on public.facebook_inbound_events(organization_id,page_id,event_time_ms,id);
alter table public.facebook_inbound_events enable row level security;
revoke all on public.facebook_inbound_events from public,anon,authenticated,service_role;
grant select on public.facebook_inbound_events to service_role;
create policy facebook_inbound_service_read on public.facebook_inbound_events for select to service_role using(true);

create function public.ingest_facebook_events(p_organization_id uuid,p_page_id text,p_events jsonb)
returns integer language plpgsql security definer set search_path='' set statement_timeout='3500ms' as $$
declare event jsonb; event_id uuid; ingested integer := 0; enqueued_at timestamptz := clock_timestamp();
begin
 if p_page_id is null or p_page_id !~ '^[0-9]{1,32}$' or p_events is null or jsonb_typeof(p_events)!='array' then
  raise exception 'invalid_facebook_batch' using errcode='22023';
 end if;
 if jsonb_array_length(p_events)>1000 or octet_length(p_events::text)>1048576 then raise exception 'invalid_facebook_batch' using errcode='22023'; end if;
 for event in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(event)!='object' or event->>'pageId' is distinct from p_page_id then raise exception 'invalid_facebook_page' using errcode='22023'; end if;
  insert into public.facebook_inbound_events(organization_id,page_id,provider_key,kind,sender_id,recipient_id,event_time_ms,delivery_time_ms,data)
  values(p_organization_id,p_page_id,event->>'providerKey',event->>'kind',event->>'senderId',event->>'recipientId',(event->>'eventTimeMs')::bigint,(event->>'deliveryTimeMs')::bigint,event->'data')
  on conflict(organization_id,page_id,provider_key) do nothing returning id into event_id;
  if event_id is not null then
   ingested := ingested+1;
   -- Echoes are retained for reconciliation only; they never launch reply work.
   if event->>'kind'!='echo' then
    perform public.enqueue_business_job(p_organization_id,'inbound_event',event_id,event_id,enqueued_at,5);
   end if;
  end if;
 end loop;
 return ingested;
end $$;
revoke all on function public.ingest_facebook_events(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_facebook_events(uuid,text,jsonb) to service_role;
