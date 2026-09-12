-- SPDX-License-Identifier: Apache-2.0
-- OV-058 website outbound. Persist VISIBLE is delivery; no Graph and no messenger_outbox for WEB.
create table public.web_outbound (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 inbound_event_id uuid not null unique references public.web_inbound_events(id),
 conversation_id uuid not null references public.conversations(id),
 conversation_revision integer not null check(conversation_revision>=0),
 kind text not null check(kind in ('reply','handoff_ack')),
 handoff_id uuid references public.conversation_handoffs(id),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 request_key uuid not null unique,
 text text not null check(char_length(text) between 1 and 1800),
 status text not null check(status in ('PENDING','VISIBLE','SUPPRESSED')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((kind='handoff_ack')=(handoff_id is not null))
);
create unique index web_outbound_one_handoff_ack on public.web_outbound(handoff_id) where kind='handoff_ack';
create index web_outbound_visible_idx on public.web_outbound(conversation_id,created_at,id) where status='VISIBLE';
alter table public.web_outbound enable row level security;
revoke all on public.web_outbound from public,anon,authenticated,service_role;
grant select on public.web_outbound to service_role;
create policy web_outbound_service_read on public.web_outbound for select to service_role using(true);

create or replace function public.enqueue_messenger_outbox_from_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.conversations; body text; kind text; handoff uuid; digest text; outbox_id uuid; request uuid;
begin
 kind := new.candidate->>'type';
 if kind not in ('reply','handoff_ack') then return new; end if;
 body := new.candidate->>'text';
 if body is null or char_length(body) not between 1 and 1800 then raise exception 'invalid_messenger_candidate' using errcode='22023'; end if;
 select * into c from public.conversations where id=new.conversation_id for update;
 if not found then raise exception 'invalid_messenger_candidate' using errcode='22023'; end if;
 if c.channel is distinct from 'FACEBOOK' then return new; end if;
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

create function public.enqueue_web_outbound_from_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.conversations; body text; kind text; handoff uuid; digest text; outbox_id uuid; request uuid;
begin
 kind := new.candidate->>'type';
 if kind not in ('reply','handoff_ack') then return new; end if;
 body := new.candidate->>'text';
 if body is null or char_length(body) not between 1 and 1800 then raise exception 'invalid_web_candidate' using errcode='22023'; end if;
 select * into c from public.conversations where id=new.conversation_id for update;
 if not found then raise exception 'invalid_web_candidate' using errcode='22023'; end if;
 if c.channel is distinct from 'WEB' then return new; end if;
 handoff := nullif(new.candidate->>'handoffId','')::uuid;
 if kind='handoff_ack' and handoff is null then raise exception 'invalid_web_candidate' using errcode='22023'; end if;
 digest := encode(sha256(convert_to(jsonb_build_object('channelUserKey',c.channel_user_key,'kind',kind,'text',body)::text,'UTF8')),'hex');
 request := gen_random_uuid();
 insert into public.web_outbound(organization_id,inbound_event_id,conversation_id,conversation_revision,kind,handoff_id,payload_hash,request_key,text,status)
 values(new.organization_id,new.event_id,c.id,coalesce((new.candidate->>'revision')::integer,c.revision),kind,handoff,digest,request,body,'PENDING')
 on conflict(inbound_event_id) do nothing returning id,request_key into outbox_id,request;
 if outbox_id is null then return new; end if;
 perform public.enqueue_business_job(new.organization_id,'outbound_message',outbox_id,request,clock_timestamp(),5);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(new.organization_id,'system','web.queued','web_outbound',outbox_id,kind,new.event_id,outbox_id);
 return new;
end $$;
create trigger web_outbound_from_receipt after insert or update of status,candidate on public.consultation_receipts
 for each row when (new.status='completed' and new.candidate is not null)
 execute function public.enqueue_web_outbound_from_receipt();

create or replace function public.claim_messenger_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp())
returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b
  join public.messenger_outbox o on o.id=b.entity_id
  where b.kind='outbound_message' and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now))
  order by b.available_at,b.id for update of b skip locked loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *;
  return;
  end if;
 end loop;
end $$;

create function public.claim_web_outbound_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp())
returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b
  join public.web_outbound o on o.id=b.entity_id
  where b.kind='outbound_message' and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now))
  order by b.available_at,b.id for update of b skip locked loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *;
  return;
  end if;
 end loop;
end $$;

create function public.authorize_web_outbound(p_job_id uuid, p_owner uuid, p_token uuid, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; o public.web_outbound; c public.conversations; eligible boolean;
begin
 if p_now is null then raise exception 'invalid_web_clock' using errcode='22023'; end if;
 select * into j from public.business_jobs where id=p_job_id for update;
 if j.kind is distinct from 'outbound_message' or j.status is distinct from 'running' or j.lease_owner is distinct from p_owner or j.lease_token is distinct from p_token then
  return jsonb_build_object('action','reject');
 end if;
 select * into o from public.web_outbound where id=j.entity_id for update;
 if not found then raise exception 'web_outbound_missing' using errcode='22023'; end if;
 if o.status in ('VISIBLE','SUPPRESSED') then
  return jsonb_build_object('action','done','status',o.status);
 end if;
 if o.status is distinct from 'PENDING' then
  return jsonb_build_object('action','reject');
 end if;
 select * into c from public.conversations where id=o.conversation_id for update;
 if o.kind='reply' then eligible := c.status='AI_ACTIVE' and c.active_handoff_id is null and c.revision=o.conversation_revision;
 else eligible := c.active_handoff_id is not distinct from o.handoff_id and c.revision=o.conversation_revision;
 end if;
 if not eligible then
  update public.web_outbound set status='SUPPRESSED',updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','web.suppressed','web_outbound',o.id,'suppressed',o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('action','done','status','SUPPRESSED');
 end if;
 update public.web_outbound set status='VISIBLE',updated_at=p_now where id=o.id returning * into o;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(o.organization_id,'system','web.visible','web_outbound',o.id,o.kind,o.inbound_event_id,gen_random_uuid());
 return jsonb_build_object('action','visible','text',o.text,'kind',o.kind);
end $$;

revoke all on function public.enqueue_web_outbound_from_receipt(), public.claim_web_outbound_job(uuid,integer,timestamptz), public.authorize_web_outbound(uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.claim_web_outbound_job(uuid,integer,timestamptz), public.authorize_web_outbound(uuid,uuid,uuid,timestamptz) to service_role;
