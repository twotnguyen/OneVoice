-- SPDX-License-Identifier: Apache-2.0
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 page_id text not null check(page_id ~ '^[0-9]{1,32}$'),
 psid text not null check(char_length(psid) between 1 and 256),
 status text not null default 'AI_ACTIVE' check(status in ('AI_ACTIVE','WAITING_STAFF','STAFF_ACTIVE')),
 revision integer not null default 0 check(revision>=0),
 active_handoff_id uuid,
 last_event_time_ms bigint,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,page_id,psid),
 check((status='AI_ACTIVE')=(active_handoff_id is null))
);
create table public.conversation_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id),
 ai_disposition text not null default 'eligible' check(ai_disposition in ('eligible','suppressed')),
 inbound_event_id uuid not null unique references public.facebook_inbound_events(id),
 provider_key text not null,
 kind text not null check(kind in ('message','postback','referral')),
 event_time_ms bigint,
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=65536),
 received_at timestamptz not null default clock_timestamp(),
 unique(conversation_id,provider_key)
);
create index conversation_messages_order_idx on public.conversation_messages(conversation_id,event_time_ms,id);
create table public.conversation_handoffs (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id),
 source_event_id uuid not null references public.facebook_inbound_events(id),
 reason text not null check(reason in ('return_request','warranty_request','customer_requested','missing_evidence','lookup_failed')),
 status text not null default 'WAITING_STAFF' check(status in ('WAITING_STAFF','STAFF_ACTIVE','COMPLETED')),
 claimed_by uuid references auth.users(id),
 requested_at timestamptz not null default clock_timestamp(),
 claimed_at timestamptz,
 completed_at timestamptz,
 check((status='WAITING_STAFF' and claimed_by is null and claimed_at is null and completed_at is null) or (status='STAFF_ACTIVE' and claimed_by is not null and claimed_at is not null and completed_at is null) or (status='COMPLETED' and claimed_by is not null and claimed_at is not null and completed_at is not null))
);
create unique index conversation_one_open_handoff_idx on public.conversation_handoffs(conversation_id) where status!='COMPLETED';
alter table public.conversations add constraint conversation_active_handoff_fk foreign key(active_handoff_id) references public.conversation_handoffs(id);
create table public.conversation_handoff_decisions (
 source_event_id uuid primary key references public.facebook_inbound_events(id),
 conversation_id uuid not null references public.conversations(id),
 handoff_id uuid not null references public.conversation_handoffs(id),
 reason text not null
);
create table public.conversation_transition_receipts (
 request_id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 fingerprint text not null,
 result jsonb not null
);
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_handoffs enable row level security;
alter table public.conversation_handoff_decisions enable row level security;
alter table public.conversation_transition_receipts enable row level security;
revoke all on public.conversations,public.conversation_messages,public.conversation_handoffs,public.conversation_handoff_decisions,public.conversation_transition_receipts from public,anon,authenticated,service_role;
grant select on public.conversations,public.conversation_messages,public.conversation_handoffs to service_role;
create policy conversations_service_read on public.conversations for select to service_role using(true);
create policy conversation_messages_service_read on public.conversation_messages for select to service_role using(true);
create policy conversation_handoffs_service_read on public.conversation_handoffs for select to service_role using(true);

create function public.conversation_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'organizationId',c.organization_id,'pageId',c.page_id,'psid',c.psid,'status',c.status,'revision',c.revision,'activeHandoffId',c.active_handoff_id,'reason',h.reason,'claimedBy',h.claimed_by,'lastEventTimeMs',c.last_event_time_ms)
 from public.conversations c left join public.conversation_handoffs h on h.id=c.active_handoff_id where c.id=p_id;
$$;
revoke all on function public.conversation_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.project_facebook_conversation(p_organization_id uuid,p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.facebook_inbound_events; c public.conversations; inserted_id uuid; suppressed boolean; disposition text;
begin
 select * into e from public.facebook_inbound_events where id=p_event_id and organization_id=p_organization_id;
 if not found then raise exception 'conversation_event_missing' using errcode='22023'; end if;
 -- Public feed identities and outbound echoes never become a private PSID identity.
 if e.kind not in ('message','postback','referral') then return jsonb_build_object('ignored',true); end if;
 if e.sender_id is null or e.sender_id=e.page_id or e.recipient_id is distinct from e.page_id then raise exception 'invalid_conversation_identity' using errcode='22023'; end if;
 insert into public.conversations(organization_id,page_id,psid) values(e.organization_id,e.page_id,e.sender_id) on conflict(organization_id,page_id,psid) do nothing;
 select * into c from public.conversations where organization_id=e.organization_id and page_id=e.page_id and psid=e.sender_id for update;
 -- Delivery receipt time belongs to the durable inbox, not this delayed worker run.
 -- Completion resumes only newly received input; all older backlog stays suppressed.
 suppressed := c.status!='AI_ACTIVE' or exists(select 1 from public.conversation_handoffs h where h.conversation_id=c.id and h.completed_at is not null and e.received_at<=h.completed_at);
 insert into public.conversation_messages(conversation_id,inbound_event_id,provider_key,kind,event_time_ms,data,received_at,ai_disposition) values(c.id,e.id,e.provider_key,e.kind,e.event_time_ms,e.data,e.received_at,case when suppressed then 'suppressed' else 'eligible' end)
 on conflict(inbound_event_id) do nothing returning id into inserted_id;
 if suppressed then update public.conversation_messages set ai_disposition='suppressed' where inbound_event_id=e.id; end if;
 select ai_disposition into disposition from public.conversation_messages where inbound_event_id=e.id;
 if inserted_id is not null then update public.conversations set last_event_time_ms=greatest(last_event_time_ms,e.event_time_ms),updated_at=clock_timestamp() where id=c.id; end if;
 return jsonb_build_object('ignored',false,'inserted',inserted_id is not null,'aiEligible',disposition='eligible' and c.status='AI_ACTIVE','conversation',public.conversation_snapshot(c.id));
end $$;

create function public.request_conversation_handoff(p_organization_id uuid,p_event_id uuid,p_expected_revision integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare projected jsonb; c public.conversations; decision public.conversation_handoff_decisions; handoff_id uuid;
begin
 if p_reason is null or p_reason not in ('return_request','warranty_request','customer_requested','missing_evidence','lookup_failed') or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_handoff_request' using errcode='22023'; end if;
 -- Projection, source dedup, request creation and AI pause share this transaction/lock.
 projected := public.project_facebook_conversation(p_organization_id,p_event_id);
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

create function public.transition_conversation_handoff(p_organization_id uuid,p_actor_id uuid,p_conversation_id uuid,p_expected_revision integer,p_operation text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations; h public.conversation_handoffs; actor_role text; receipt public.conversation_transition_receipts; fingerprint text; result jsonb;
begin
 select role into actor_role from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in ('staff','manager') for share;
 if not found then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_operation is null or p_operation not in ('claim','complete') then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 select * into c from public.conversations where id=p_conversation_id and organization_id=p_organization_id for update;
 if not found then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 fingerprint := encode(sha256(convert_to(jsonb_build_array(p_conversation_id,p_expected_revision,p_operation)::text,'UTF8')),'hex');
 select * into receipt from public.conversation_transition_receipts where request_id=p_request_id;
 if found then
  if receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.fingerprint<>fingerprint then raise exception 'conversation_version_conflict' using errcode='40001'; end if;
  return receipt.result;
 end if;
 if c.revision<>p_expected_revision then raise exception 'conversation_version_conflict' using errcode='40001'; end if;
 select * into h from public.conversation_handoffs where id=c.active_handoff_id;
 if p_operation='claim' then
  if c.status!='WAITING_STAFF' then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
  update public.conversation_handoffs set status='STAFF_ACTIVE',claimed_by=p_actor_id,claimed_at=clock_timestamp() where id=h.id;
  update public.conversations set status='STAFF_ACTIVE',revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 else
  if c.status!='STAFF_ACTIVE' then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
  if h.claimed_by<>p_actor_id and actor_role!='manager' then raise exception 'conversation_forbidden' using errcode='42501'; end if;
  update public.conversation_handoffs set status='COMPLETED',completed_at=clock_timestamp() where id=h.id;
  update public.conversations set status='AI_ACTIVE',active_handoff_id=null,revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 end if;
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,case when p_operation='claim' then 'conversation.handoff_claimed' else 'conversation.handoff_completed' end,'conversation',c.id,'staff_workflow',p_request_id,p_request_id);
 result := public.conversation_snapshot(c.id);
 insert into public.conversation_transition_receipts(request_id,organization_id,actor_id,fingerprint,result) values(p_request_id,p_organization_id,p_actor_id,fingerprint,result);
 return result;
end $$;
revoke all on function public.project_facebook_conversation(uuid,uuid) from public,anon,authenticated;
revoke all on function public.request_conversation_handoff(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.transition_conversation_handoff(uuid,uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.project_facebook_conversation(uuid,uuid) to service_role;
grant execute on function public.request_conversation_handoff(uuid,uuid,integer,text) to service_role;
grant execute on function public.transition_conversation_handoff(uuid,uuid,uuid,integer,text,uuid) to service_role;
