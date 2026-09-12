-- SPDX-License-Identifier: Apache-2.0
-- Messenger send outbox. SENT means Graph accepted the request, not delivered/read.
create table public.messenger_outbox (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 page_id text not null check(page_id ~ '^[0-9]{1,32}$'),
 psid text not null check(char_length(psid) between 1 and 256),
 inbound_event_id uuid not null unique references public.facebook_inbound_events(id),
 conversation_id uuid not null references public.conversations(id),
 conversation_revision integer not null check(conversation_revision>=0),
 kind text not null check(kind in ('reply','handoff_ack')),
 handoff_id uuid references public.conversation_handoffs(id),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 request_key uuid not null unique,
 text text not null check(char_length(text) between 1 and 1800),
 status text not null check(status in ('PENDING','SENDING','SENT','UNKNOWN','FAILED','SUPPRESSED')),
 attempt integer not null default 0 check(attempt>=0 and attempt<=20),
 max_attempts integer not null default 5 check(max_attempts between 1 and 20),
 lease_owner uuid,
 lease_token uuid,
 lease_expires_at timestamptz,
 remote_id text check(remote_id is null or char_length(remote_id) between 1 and 256),
 error_code text check(error_code is null or error_code in ('permission','invalid_parameter','token','unreachable','rate_limit','window','malformed','timeout','unknown','exhausted')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((kind='handoff_ack')=(handoff_id is not null)),
 check((status='SENDING')=(lease_owner is not null and lease_token is not null and lease_expires_at is not null)),
 check((status='SENT')=(remote_id is not null)),
 check(status not in ('FAILED','UNKNOWN') or error_code is not null)
);
create unique index messenger_outbox_one_handoff_ack on public.messenger_outbox(handoff_id) where kind='handoff_ack';
create index messenger_outbox_ops_idx on public.messenger_outbox(organization_id,status,updated_at desc) where status in ('UNKNOWN','FAILED','SUPPRESSED','SENDING','SENT');
create view public.messenger_outbox_operations as
 select id, organization_id, page_id, inbound_event_id, conversation_id, kind, status, attempt, remote_id, error_code, updated_at
 from public.messenger_outbox
 where status in ('UNKNOWN','FAILED','SUPPRESSED','SENDING','SENT');
alter table public.messenger_outbox enable row level security;
revoke all on public.messenger_outbox, public.messenger_outbox_operations from public,anon,authenticated,service_role;
grant select on public.messenger_outbox, public.messenger_outbox_operations to service_role;
create policy messenger_outbox_service_read on public.messenger_outbox for select to service_role using(true);

create function public.enqueue_messenger_outbox_from_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.conversations; body text; kind text; handoff uuid; digest text; outbox_id uuid; request uuid;
begin
 kind := new.candidate->>'type';
 if kind not in ('reply','handoff_ack') then return new; end if;
 body := new.candidate->>'text';
 if body is null or char_length(body) not between 1 and 1800 then raise exception 'invalid_messenger_candidate' using errcode='22023'; end if;
 select * into c from public.conversations where id=new.conversation_id for update;
 if not found then raise exception 'invalid_messenger_candidate' using errcode='22023'; end if;
 handoff := nullif(new.candidate->>'handoffId','')::uuid;
 if kind='handoff_ack' and handoff is null then raise exception 'invalid_messenger_candidate' using errcode='22023'; end if;
 digest := encode(sha256(convert_to(jsonb_build_object('pageId',c.page_id,'psid',c.psid,'kind',kind,'text',body)::text,'UTF8')),'hex');
 request := gen_random_uuid();
 insert into public.messenger_outbox(organization_id,page_id,psid,inbound_event_id,conversation_id,conversation_revision,kind,handoff_id,payload_hash,request_key,text,status)
 values(new.organization_id,c.page_id,c.psid,new.event_id,c.id,coalesce((new.candidate->>'revision')::integer,c.revision),kind,handoff,digest,request,body,'PENDING')
 on conflict(inbound_event_id) do nothing returning id,request_key into outbox_id,request;
 if outbox_id is null then return new; end if;
 perform public.enqueue_business_job(new.organization_id,'outbound_message',outbox_id,request,clock_timestamp(),5);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(new.organization_id,'system','messenger.queued','messenger_outbox',outbox_id,kind,new.event_id,outbox_id);
 return new;
end $$;
create trigger messenger_outbox_from_receipt after insert or update of status,candidate on public.consultation_receipts
 for each row when (new.status='completed' and new.candidate is not null)
 execute function public.enqueue_messenger_outbox_from_receipt();

create function public.claim_messenger_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp())
returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b where b.kind='outbound_message' and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now)) order by b.available_at,b.id for update of b skip locked loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *;
  return;
  end if;
 end loop;
end $$;

create function public.authorize_messenger_send(p_job_id uuid, p_owner uuid, p_token uuid, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; o public.messenger_outbox; c public.conversations; e public.facebook_inbound_events; event_at timestamptz; eligible boolean;
begin
 if p_now is null then raise exception 'invalid_messenger_clock' using errcode='22023'; end if;
 select * into j from public.business_jobs where id=p_job_id for update;
 if j.kind is distinct from 'outbound_message' or j.status is distinct from 'running' or j.lease_owner is distinct from p_owner or j.lease_token is distinct from p_token then
  return jsonb_build_object('action','reject');
 end if;
 select * into o from public.messenger_outbox where id=j.entity_id for update;
 if not found then raise exception 'messenger_outbox_missing' using errcode='22023'; end if;
 if o.status in ('SENT','FAILED','SUPPRESSED','UNKNOWN') then
  return jsonb_build_object('action','done','status',o.status,'errorCode',o.error_code,'remoteId',o.remote_id);
 end if;
 if o.status='SENDING' then
  update public.messenger_outbox set status='UNKNOWN',error_code='unknown',lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','messenger.unknown','messenger_outbox',o.id,'unknown',o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('action','done','status','UNKNOWN','errorCode','unknown');
 end if;
 select * into c from public.conversations where id=o.conversation_id for update;
 select * into e from public.facebook_inbound_events where id=o.inbound_event_id;
 if o.kind='reply' then eligible := c.status='AI_ACTIVE' and c.active_handoff_id is null and c.revision=o.conversation_revision;
 else eligible := c.active_handoff_id is not distinct from o.handoff_id and c.revision=o.conversation_revision;
 end if;
 if not eligible then
  update public.messenger_outbox set status='SUPPRESSED',error_code=null,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','messenger.suppressed','messenger_outbox',o.id,'suppressed',o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('action','done','status','SUPPRESSED');
 end if;
 event_at := case when e.event_time_ms is not null then to_timestamp(e.event_time_ms/1000.0) else e.received_at end;
 if p_now >= event_at + interval '24 hours' then
  update public.messenger_outbox set status='FAILED',error_code='window',lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','messenger.failed','messenger_outbox',o.id,'window',o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('action','done','status','FAILED','errorCode','window');
 end if;
 if o.attempt>=o.max_attempts then
  update public.messenger_outbox set status='FAILED',error_code='exhausted',lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  return jsonb_build_object('action','done','status','FAILED','errorCode','exhausted');
 end if;
 update public.messenger_outbox set status='SENDING',attempt=attempt+1,lease_owner=p_owner,lease_token=p_token,lease_expires_at=j.lease_expires_at,error_code=null,updated_at=p_now where id=o.id returning * into o;
 return jsonb_build_object('action','send','pageId',o.page_id,'psid',o.psid,'text',o.text,'kind',o.kind,'attempt',o.attempt);
end $$;

create function public.complete_messenger_send(p_job_id uuid, p_owner uuid, p_token uuid, p_result jsonb, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; o public.messenger_outbox; outcome text; code text; message_id text; retry boolean:=false;
begin
 if p_now is null or p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'invalid_messenger_result' using errcode='22023'; end if;
 select * into j from public.business_jobs where id=p_job_id for update;
 select * into o from public.messenger_outbox where id=j.entity_id for update;
 if o.status is distinct from 'SENDING' or o.lease_owner is distinct from p_owner or o.lease_token is distinct from p_token or j.status is distinct from 'running' or j.lease_owner is distinct from p_owner or j.lease_token is distinct from p_token then
  return jsonb_build_object('ok',false,'status',o.status);
 end if;
 outcome := p_result->>'outcome';
 code := p_result->>'errorCode';
 message_id := p_result->>'messageId';
 if outcome='accepted' and char_length(message_id) between 1 and 256 then
  update public.messenger_outbox set status='SENT',remote_id=message_id,error_code=null,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','messenger.accepted','messenger_outbox',o.id,'accepted',o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('ok',true,'status','SENT','retry',false);
 end if;
 if outcome='accepted' then code:='malformed'; outcome:='unknown'; end if;
 if outcome='unknown' then
  if code is null or code not in ('malformed','timeout','unknown') then code:='unknown'; end if;
  update public.messenger_outbox set status='UNKNOWN',error_code=code,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','messenger.unknown','messenger_outbox',o.id,code,o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('ok',true,'status','UNKNOWN','retry',false);
 end if;
 if outcome<>'rejected' or code is null or code not in ('permission','invalid_parameter','token','unreachable','rate_limit','window') then
  update public.messenger_outbox set status='UNKNOWN',error_code='unknown',lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  return jsonb_build_object('ok',true,'status','UNKNOWN','retry',false);
 end if;
 retry := code='rate_limit' and o.attempt<o.max_attempts;
 if retry then
  update public.messenger_outbox set status='PENDING',error_code=code,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
 else
  update public.messenger_outbox set status='FAILED',error_code=code,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','messenger.failed','messenger_outbox',o.id,code,o.inbound_event_id,gen_random_uuid());
 end if;
 return jsonb_build_object('ok',true,'status',case when retry then 'PENDING' else 'FAILED' end,'retry',retry);
end $$;

create function public.read_messenger_outbox_operations(p_organization_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'messenger_forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'pageId',o.page_id,'inboundEventId',o.inbound_event_id,'conversationId',o.conversation_id,'kind',o.kind,'status',o.status,'attempt',o.attempt,'remoteId',o.remote_id,'errorCode',o.error_code,'updatedAt',o.updated_at) order by o.updated_at desc,o.id),'[]'::jsonb)
 into result from public.messenger_outbox o where o.organization_id=p_organization_id and o.status in ('UNKNOWN','FAILED','SUPPRESSED','SENDING','SENT');
 return jsonb_build_object('items',result);
end $$;

revoke all on function public.enqueue_messenger_outbox_from_receipt(), public.claim_messenger_job(uuid,integer,timestamptz), public.authorize_messenger_send(uuid,uuid,uuid,timestamptz), public.complete_messenger_send(uuid,uuid,uuid,jsonb,timestamptz), public.read_messenger_outbox_operations(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_messenger_job(uuid,integer,timestamptz), public.authorize_messenger_send(uuid,uuid,uuid,timestamptz), public.complete_messenger_send(uuid,uuid,uuid,jsonb,timestamptz), public.read_messenger_outbox_operations(uuid,uuid) to service_role;
