-- SPDX-License-Identifier: Apache-2.0
-- OV-054 channel-neutral conversations.
-- Inbound pointer: keep conversation_messages.inbound_event_id as the event UUID and add
-- nullable facebook_inbound_event_id + web_inbound_event_id with XOR. WEB messages persist
-- without facebook_inbound_events. Handoff/receipt/gap event FKs are relaxed to UUID.
-- WEB identity is unique (organization_id, channel, channel_user_key). FACEBOOK keeps
-- unique (organization_id, page_id, psid) so two Pages with the same PSID stay two rows;
-- channel_user_key backfill is the PSID.

alter table public.conversations
 add column channel text not null default 'FACEBOOK',
 add column channel_user_key text;
update public.conversations set channel='FACEBOOK', channel_user_key=psid where channel_user_key is null;
alter table public.conversations alter column channel_user_key set not null;
alter table public.conversations
 add constraint conversations_channel_check check(channel in ('FACEBOOK','WEB')),
 add constraint conversations_channel_user_key_check check(char_length(channel_user_key) between 1 and 256);

create unique index conversations_facebook_identity_idx on public.conversations(organization_id,page_id,psid) where channel='FACEBOOK';
create unique index conversations_web_identity_idx on public.conversations(organization_id,channel,channel_user_key) where channel='WEB';

create function public.conversations_fill_channel_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if new.channel is null then new.channel:='FACEBOOK'; end if;
 if new.channel='FACEBOOK' and new.channel_user_key is null then new.channel_user_key:=new.psid; end if;
 return new;
end $$;
create trigger conversations_fill_channel_identity before insert or update on public.conversations
 for each row execute function public.conversations_fill_channel_identity();
revoke all on function public.conversations_fill_channel_identity() from public,anon,authenticated,service_role;

create table public.web_inbound_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 channel text not null default 'WEB' check(channel='WEB'),
 provider_key text not null check(char_length(provider_key) between 1 and 320),
 kind text not null default 'message' check(kind='message'),
 sender_key text not null check(char_length(sender_key) between 1 and 256),
 event_time_ms bigint check(event_time_ms>=0 and event_time_ms<=8640000000000000),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=65536),
 received_at timestamptz not null default clock_timestamp(),
 unique(organization_id,provider_key)
);
create index web_inbound_events_timeline_idx on public.web_inbound_events(organization_id,event_time_ms,id);
alter table public.web_inbound_events enable row level security;
revoke all on public.web_inbound_events from public,anon,authenticated,service_role;
grant select on public.web_inbound_events to service_role;
create policy web_inbound_service_read on public.web_inbound_events for select to service_role using(true);

alter table public.conversation_messages drop constraint conversation_messages_inbound_event_id_fkey;
alter table public.conversation_handoffs drop constraint conversation_handoffs_source_event_id_fkey;
alter table public.conversation_handoff_decisions drop constraint conversation_handoff_decisions_source_event_id_fkey;
alter table public.consultation_receipts drop constraint consultation_receipts_event_id_fkey;
alter table public.knowledge_gap_occurrences drop constraint knowledge_gap_occurrences_source_event_id_fkey;

alter table public.conversation_messages
 add column facebook_inbound_event_id uuid,
 add column web_inbound_event_id uuid;
update public.conversation_messages set facebook_inbound_event_id=inbound_event_id;
alter table public.conversation_messages
 add constraint conversation_messages_facebook_inbound_event_id_fkey foreign key(facebook_inbound_event_id) references public.facebook_inbound_events(id),
 add constraint conversation_messages_web_inbound_event_id_fkey foreign key(web_inbound_event_id) references public.web_inbound_events(id),
 add constraint conversation_messages_inbound_pointer_xor check((facebook_inbound_event_id is not null)<>(web_inbound_event_id is not null)),
 add constraint conversation_messages_inbound_pointer_match check(inbound_event_id=coalesce(facebook_inbound_event_id,web_inbound_event_id));
create unique index conversation_messages_facebook_inbound_event_idx on public.conversation_messages(facebook_inbound_event_id) where facebook_inbound_event_id is not null;
create unique index conversation_messages_web_inbound_event_idx on public.conversation_messages(web_inbound_event_id) where web_inbound_event_id is not null;

create or replace function public.conversation_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'organizationId',c.organization_id,'channel',c.channel,'channelUserKey',c.channel_user_key,'pageId',c.page_id,'psid',c.psid,'status',c.status,'revision',c.revision,'activeHandoffId',c.active_handoff_id,'reason',h.reason,'claimedBy',h.claimed_by,'lastEventTimeMs',c.last_event_time_ms)
 from public.conversations c left join public.conversation_handoffs h on h.id=c.active_handoff_id where c.id=p_id;
$$;

create or replace function public.project_facebook_conversation(p_organization_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.facebook_inbound_events; c public.conversations; inserted_id uuid; suppressed boolean; disposition text;
begin
 select * into e from public.facebook_inbound_events where id=p_event_id and organization_id=p_organization_id;
 if not found then raise exception 'conversation_event_missing' using errcode='22023'; end if;
 -- Public feed identities and outbound echoes never become a private PSID identity.
 if e.kind not in ('message','postback','referral') then return jsonb_build_object('ignored',true); end if;
 if e.sender_id is null or e.sender_id=e.page_id or e.recipient_id is distinct from e.page_id then raise exception 'invalid_conversation_identity' using errcode='22023'; end if;
 insert into public.conversations(organization_id,page_id,psid,channel,channel_user_key) values(e.organization_id,e.page_id,e.sender_id,'FACEBOOK',e.sender_id)
  on conflict (organization_id,page_id,psid) where channel='FACEBOOK' do nothing;
 select * into c from public.conversations where organization_id=e.organization_id and page_id=e.page_id and psid=e.sender_id for update;
 -- Delivery receipt time belongs to the durable inbox, not this delayed worker run.
 -- Completion resumes only newly received input; all older backlog stays suppressed.
 suppressed := c.status!='AI_ACTIVE' or exists(select 1 from public.conversation_handoffs h where h.conversation_id=c.id and h.completed_at is not null and e.received_at<=h.completed_at);
 insert into public.conversation_messages(conversation_id,inbound_event_id,facebook_inbound_event_id,web_inbound_event_id,provider_key,kind,event_time_ms,data,received_at,ai_disposition)
  values(c.id,e.id,e.id,null,e.provider_key,e.kind,e.event_time_ms,e.data,e.received_at,case when suppressed then 'suppressed' else 'eligible' end)
  on conflict(inbound_event_id) do nothing returning id into inserted_id;
 if suppressed then update public.conversation_messages set ai_disposition='suppressed' where inbound_event_id=e.id; end if;
 select ai_disposition into disposition from public.conversation_messages where inbound_event_id=e.id;
 if inserted_id is not null then update public.conversations set last_event_time_ms=greatest(last_event_time_ms,e.event_time_ms),updated_at=clock_timestamp() where id=c.id; end if;
 return jsonb_build_object('ignored',false,'inserted',inserted_id is not null,'aiEligible',disposition='eligible' and c.status='AI_ACTIVE','conversation',public.conversation_snapshot(c.id));
end $$;

alter table public.conversations drop constraint conversations_organization_id_page_id_psid_key;
alter table public.conversations alter column page_id drop not null;
alter table public.conversations alter column psid drop not null;
alter table public.conversations add constraint conversations_channel_identity_check
 check((channel='FACEBOOK' and page_id is not null and psid is not null) or (channel='WEB' and page_id is null and psid is null));

create function public.project_web_conversation(p_organization_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.web_inbound_events; c public.conversations; inserted_id uuid; suppressed boolean; disposition text;
begin
 select * into e from public.web_inbound_events where id=p_event_id and organization_id=p_organization_id;
 if not found then raise exception 'conversation_event_missing' using errcode='22023'; end if;
 if e.kind is distinct from 'message' then return jsonb_build_object('ignored',true); end if;
 if e.sender_key is null or char_length(e.sender_key) not between 1 and 256 then raise exception 'invalid_conversation_identity' using errcode='22023'; end if;
 insert into public.conversations(organization_id,channel,channel_user_key) values(e.organization_id,'WEB',e.sender_key)
  on conflict (organization_id,channel,channel_user_key) where channel='WEB' do nothing;
 select * into c from public.conversations where organization_id=e.organization_id and channel='WEB' and channel_user_key=e.sender_key for update;
 suppressed := c.status!='AI_ACTIVE' or exists(select 1 from public.conversation_handoffs h where h.conversation_id=c.id and h.completed_at is not null and e.received_at<=h.completed_at);
 insert into public.conversation_messages(conversation_id,inbound_event_id,facebook_inbound_event_id,web_inbound_event_id,provider_key,kind,event_time_ms,data,received_at,ai_disposition)
  values(c.id,e.id,null,e.id,e.provider_key,e.kind,e.event_time_ms,e.data,e.received_at,case when suppressed then 'suppressed' else 'eligible' end)
  on conflict(inbound_event_id) do nothing returning id into inserted_id;
 if suppressed then update public.conversation_messages set ai_disposition='suppressed' where inbound_event_id=e.id; end if;
 select ai_disposition into disposition from public.conversation_messages where inbound_event_id=e.id;
 if inserted_id is not null then update public.conversations set last_event_time_ms=greatest(last_event_time_ms,e.event_time_ms),updated_at=clock_timestamp() where id=c.id; end if;
 return jsonb_build_object('ignored',false,'inserted',inserted_id is not null,'aiEligible',disposition='eligible' and c.status='AI_ACTIVE','conversation',public.conversation_snapshot(c.id));
end $$;

create function public.ingest_web_event(p_organization_id uuid,p_event jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid; existing uuid; kind text;
begin
 if p_organization_id is null or p_event is null or jsonb_typeof(p_event)!='object' then raise exception 'invalid_web_event' using errcode='22023'; end if;
 kind:=coalesce(p_event->>'kind','message');
 if kind is distinct from 'message' then raise exception 'invalid_web_event' using errcode='22023'; end if;
 if p_event->>'providerKey' is null or char_length(p_event->>'providerKey') not between 1 and 320 then raise exception 'invalid_web_event' using errcode='22023'; end if;
 if p_event->>'senderKey' is null or char_length(p_event->>'senderKey') not between 1 and 256 then raise exception 'invalid_web_event' using errcode='22023'; end if;
 if p_event->'data' is null or jsonb_typeof(p_event->'data')!='object' or octet_length((p_event->'data')::text)>65536 then raise exception 'invalid_web_event' using errcode='22023'; end if;
 insert into public.web_inbound_events(organization_id,provider_key,kind,sender_key,event_time_ms,data)
 values(p_organization_id,p_event->>'providerKey',kind,p_event->>'senderKey',(p_event->>'eventTimeMs')::bigint,p_event->'data')
 on conflict(organization_id,provider_key) do nothing returning id into event_id;
 if event_id is not null then
  perform public.enqueue_business_job(p_organization_id,'inbound_event',event_id,event_id,clock_timestamp(),5);
  return event_id;
 end if;
 select id into existing from public.web_inbound_events where organization_id=p_organization_id and provider_key=p_event->>'providerKey';
 return existing;
end $$;

create or replace function public.request_conversation_handoff(p_organization_id uuid,p_event_id uuid,p_expected_revision integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare projected jsonb; c public.conversations; decision public.conversation_handoff_decisions; handoff_id uuid;
begin
 if p_reason is null or p_reason not in ('return_request','warranty_request','customer_requested','missing_evidence','lookup_failed') or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_handoff_request' using errcode='22023'; end if;
 if exists(select 1 from public.facebook_inbound_events where id=p_event_id and organization_id=p_organization_id) then
  projected := public.project_facebook_conversation(p_organization_id,p_event_id);
 elsif exists(select 1 from public.web_inbound_events where id=p_event_id and organization_id=p_organization_id) then
  projected := public.project_web_conversation(p_organization_id,p_event_id);
 else
  raise exception 'conversation_event_missing' using errcode='22023';
 end if;
 if (projected->>'ignored')::boolean then raise exception 'invalid_handoff_source' using errcode='22023'; end if;
 select * into c from public.conversations where id=(projected->'conversation'->>'id')::uuid for update;
 select * into decision from public.conversation_handoff_decisions where source_event_id=p_event_id;
 if found then
  if decision.reason<>p_reason then raise exception 'handoff_decision_conflict' using errcode='40001'; end if;
  return public.conversation_snapshot(c.id);
 end if;
 if c.status='AI_ACTIVE' and not (projected->>'aiEligible')::boolean then return public.conversation_snapshot(c.id); end if;
 if c.revision<>p_expected_revision then raise exception 'conversation_version_conflict' using errcode='40001'; end if;
 handoff_id := c.active_handoff_id;
 if c.status='AI_ACTIVE' then
  insert into public.conversation_handoffs(conversation_id,source_event_id,reason) values(c.id,p_event_id,p_reason) returning id into handoff_id;
  update public.conversations set status='WAITING_STAFF',active_handoff_id=handoff_id,revision=revision+1,updated_at=clock_timestamp() where id=c.id;
  update public.conversation_messages set ai_disposition='suppressed' where conversation_id=c.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_organization_id,'system','conversation.handoff_requested','conversation',c.id,p_reason,p_event_id,handoff_id);
 end if;
 insert into public.conversation_handoff_decisions(source_event_id,conversation_id,handoff_id,reason) values(p_event_id,c.id,handoff_id,p_reason);
 return public.conversation_snapshot(c.id);
end $$;

create or replace function public.claim_consultation_job(p_owner uuid,p_organization_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; e public.facebook_inbound_events; w public.web_inbound_events; c public.conversations; projected jsonb; r public.consultation_receipts; history jsonb; exhausted boolean;
 v_event_id uuid; v_received_at timestamptz; v_data jsonb;
begin
 if p_owner is null or p_organization_id is null then raise exception 'invalid_consultation_claim' using errcode='22023';end if;
 for j in select b.* from public.business_jobs b
  left join public.facebook_inbound_events f on f.id=b.entity_id and f.organization_id=b.organization_id and f.kind in('message','postback','referral')
  left join public.web_inbound_events wv on wv.id=b.entity_id and wv.organization_id=b.organization_id and wv.kind='message'
  where b.organization_id=p_organization_id and b.kind='inbound_event' and (f.id is not null or wv.id is not null)
   and ((b.status='queued' and b.available_at<=clock_timestamp()) or (b.status='running' and b.lease_expires_at<=clock_timestamp()) or (b.status in('dead','succeeded') and not exists(select 1 from public.consultation_receipts x where x.event_id=b.entity_id and x.status='completed')))
  order by coalesce(f.received_at,wv.received_at),coalesce(f.id,wv.id) for update of b skip locked limit 100 loop
  select * into w from public.web_inbound_events where id=j.entity_id;
  if found then
   v_event_id:=w.id; v_received_at:=w.received_at; v_data:=w.data;
   if exists(select 1 from public.business_jobs b join public.web_inbound_events f on f.id=b.entity_id and f.organization_id=b.organization_id where b.kind='inbound_event' and f.kind='message' and f.organization_id=w.organization_id and f.sender_key=w.sender_key and (f.received_at,f.id)<(w.received_at,w.id) and not exists(select 1 from public.consultation_receipts x where x.event_id=f.id and x.status='completed')) then continue;end if;
   projected:=public.project_web_conversation(j.organization_id,w.id);
  else
   select * into e from public.facebook_inbound_events where id=j.entity_id;
   v_event_id:=e.id; v_received_at:=e.received_at; v_data:=e.data;
   if e.sender_id is null or e.sender_id=e.page_id or e.recipient_id is distinct from e.page_id then
    insert into public.consultation_receipts(event_id,job_id,organization_id,conversation_id,revision,lease_token,status,outcome,completed_at) values(e.id,j.id,j.organization_id,null,0,gen_random_uuid(),'completed','{"type":"ignored","reason":"invalid_private_identity"}',clock_timestamp()) on conflict(event_id) do nothing;
    update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
    continue;
   end if;
   if exists(select 1 from public.business_jobs b join public.facebook_inbound_events f on f.id=b.entity_id and f.organization_id=b.organization_id where b.kind='inbound_event' and f.kind in('message','postback','referral') and f.organization_id=e.organization_id and f.page_id=e.page_id and f.sender_id=e.sender_id and (f.received_at,f.id)<(e.received_at,e.id) and not exists(select 1 from public.consultation_receipts x where x.event_id=f.id and x.status='completed')) then continue;end if;
   projected:=public.project_facebook_conversation(j.organization_id,e.id);
  end if;
  select * into c from public.conversations where id=(projected#>>'{conversation,id}')::uuid for update;
  if exists(select 1 from public.consultation_receipts x where x.conversation_id=c.id and x.status='running' and x.event_id<>v_event_id) then continue;end if;
  select * into r from public.consultation_receipts where event_id=v_event_id;
  if r.status='completed' then continue;end if;
  exhausted:=j.attempts>=least(3,j.max_attempts);
  update public.business_jobs set status='running',attempts=case when exhausted then attempts else attempts+1 end,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_started_at=clock_timestamp() where id=j.id returning * into j;
  insert into public.consultation_receipts(event_id,job_id,organization_id,conversation_id,revision,lease_token,status) values(v_event_id,j.id,j.organization_id,c.id,c.revision,j.lease_token,'running') on conflict(event_id) do update set lease_token=excluded.lease_token,revision=excluded.revision;
  if exhausted or not (projected->>'aiEligible')::boolean then
   perform public.finish_consultation(j.id,p_owner,j.lease_token,'{"type":"gap","intent":"needs","field":"specification","reason":"lookup_failed"}');
   if exhausted then update public.business_jobs set status='dead',last_error='lease_expired' where id=j.id;end if;
   continue;
  end if;
  select coalesce(jsonb_agg(h.item order by h.received_at,h.id),'[]') into history from (select m.id,m.received_at,jsonb_build_object('text',left(coalesce(m.data->>'text',m.data#>>'{postback,title}',''),600),'decision',case when x.status='completed' then jsonb_build_object('intent',x.outcome->'intent','query',x.outcome->'query','catalogItems',(select coalesce(jsonb_agg(items.item),'[]') from (select distinct jsonb_build_object('productId',claim->'productId','variantId',claim->'variantId','name',claim->'name','sku',claim->'sku') item from jsonb_array_elements(coalesce(x.candidate->'claims','[]')) claim where claim->>'kind'='catalog' limit 8) items)) else null end) item from public.conversation_messages m left join public.consultation_receipts x on x.event_id=m.inbound_event_id where m.conversation_id=c.id and (m.received_at,m.inbound_event_id)<(v_received_at,v_event_id) order by m.received_at desc,m.inbound_event_id desc limit 8) h;
  return jsonb_build_object('job',to_jsonb(j),'conversationId',c.id,'revision',c.revision,'organizationId',j.organization_id,'text',left(coalesce(v_data->>'text',v_data#>>'{postback,title}',''),4000),'history',history,'introduce',not exists(select 1 from public.consultation_receipts x where x.conversation_id=c.id and x.status='completed' and x.revision=c.revision and x.candidate->>'type'='reply'));
 end loop;
 return null;
end $$;

create or replace function public.claim_business_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp()) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b
  where b.kind not in('knowledge_ingest','render_content','outbound_message','outbound_comment')
   and not (b.kind='inbound_event' and exists(select 1 from public.facebook_inbound_events e where e.id=b.entity_id and e.organization_id=b.organization_id and e.kind in('message','postback','referral','comment')))
   and not (b.kind='inbound_event' and exists(select 1 from public.web_inbound_events w where w.id=b.entity_id and w.organization_id=b.organization_id and w.kind='message'))
   and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now))
  order by b.available_at,b.id for update of b skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *; return;
  end if;
 end loop;
end $$;

revoke all on function public.project_web_conversation(uuid,uuid), public.ingest_web_event(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.project_web_conversation(uuid,uuid), public.ingest_web_event(uuid,jsonb) to service_role;
revoke all on function public.conversation_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.project_facebook_conversation(uuid,uuid) from public,anon,authenticated;
revoke all on function public.request_conversation_handoff(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.project_facebook_conversation(uuid,uuid) to service_role;
grant execute on function public.request_conversation_handoff(uuid,uuid,integer,text) to service_role;
revoke all on function public.claim_consultation_job(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_consultation_job(uuid,uuid) to service_role;
