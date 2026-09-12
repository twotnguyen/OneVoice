-- SPDX-License-Identifier: Apache-2.0
-- Public comment invite outbox. Dedup is Page+comment ID. SENT means Graph accepted a public comment reply, not a private messaging window.
alter table public.business_jobs drop constraint business_jobs_kind_check;
alter table public.business_jobs add constraint business_jobs_kind_check check(kind in('inbound_event','outbound_message','automation_tick','knowledge_ingest','render_content','outbound_comment'));

create table public.public_comment_invitations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 page_id text not null check(page_id ~ '^[0-9]{1,32}$'),
 comment_id text not null check(char_length(comment_id) between 1 and 256),
 inbound_event_id uuid not null references public.facebook_inbound_events(id),
 disposition text not null check(disposition in ('INVITE','IGNORE')),
 text text check(text is null or char_length(text) between 1 and 800),
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 request_key uuid not null unique,
 status text not null check(status in ('PENDING','SENDING','SENT','UNKNOWN','FAILED','SUPPRESSED','IGNORED')),
 attempt integer not null default 0 check(attempt>=0 and attempt<=20),
 max_attempts integer not null default 5 check(max_attempts between 1 and 20),
 lease_owner uuid,
 lease_token uuid,
 lease_expires_at timestamptz,
 remote_id text check(remote_id is null or char_length(remote_id) between 1 and 256),
 error_code text check(error_code is null or error_code in ('permission','invalid_parameter','token','unreachable','rate_limit','window','malformed','timeout','unknown','exhausted')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,page_id,comment_id),
 check((disposition='IGNORE')=(status='IGNORED')),
 check((disposition='IGNORE')=(text is null)),
 check(disposition='IGNORE' or text='Cảm ơn bạn đã quan tâm. Vui lòng nhắn tin riêng cho Page để được hỗ trợ.'),
 check((status='SENDING')=(lease_owner is not null and lease_token is not null and lease_expires_at is not null)),
 check((status='SENT')=(remote_id is not null)),
 check(status not in ('FAILED','UNKNOWN') or error_code is not null)
);
create index public_comment_invitations_ops_idx on public.public_comment_invitations(organization_id,status,updated_at desc) where status in ('UNKNOWN','FAILED','SUPPRESSED','SENDING','SENT');
create view public.public_comment_operations as
 select id, organization_id, page_id, comment_id, inbound_event_id, disposition, status, attempt, remote_id, error_code, updated_at
 from public.public_comment_invitations
 where status in ('UNKNOWN','FAILED','SUPPRESSED','SENDING','SENT');
alter table public.public_comment_invitations enable row level security;
revoke all on public.public_comment_invitations, public.public_comment_operations from public,anon,authenticated,service_role;
grant select on public.public_comment_invitations, public.public_comment_operations to service_role;
create policy public_comment_invitations_service_read on public.public_comment_invitations for select to service_role using(true);

create or replace function public.claim_business_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp()) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b
  where b.kind not in('knowledge_ingest','render_content','outbound_message','outbound_comment')
   and not (b.kind='inbound_event' and exists(select 1 from public.facebook_inbound_events e where e.id=b.entity_id and e.organization_id=b.organization_id and e.kind in('message','postback','referral','comment')))
   and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now))
  order by b.available_at,b.id for update of b skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *; return;
  end if;
 end loop;
end $$;

create function public.claim_public_comment_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; e public.facebook_inbound_events;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b join public.facebook_inbound_events f on f.id=b.entity_id and f.organization_id=b.organization_id
  where b.kind='inbound_event' and f.kind='comment' and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now))
  order by b.available_at,b.id for update of b skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else
   update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning * into j;
   select * into e from public.facebook_inbound_events where id=j.entity_id;
   return jsonb_build_object(
    'job', jsonb_build_object('id',j.id,'organization_id',j.organization_id,'kind',j.kind,'entity_id',j.entity_id,'lease_owner',j.lease_owner,'lease_token',j.lease_token),
    'event', jsonb_build_object('pageId',e.page_id,'providerKey',e.provider_key,'kind',e.kind,'senderId',e.sender_id,'recipientId',e.recipient_id,'eventTimeMs',e.event_time_ms,'deliveryTimeMs',e.delivery_time_ms,'data',e.data)
   );
  end if;
 end loop;
 return null;
end $$;

create function public.record_public_comment_disposition(p_job_id uuid, p_owner uuid, p_token uuid, p_disposition text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; e public.facebook_inbound_events; comment text; invite text := 'Cảm ơn bạn đã quan tâm. Vui lòng nhắn tin riêng cho Page để được hỗ trợ.'; invitation_id uuid; request uuid; digest text;
begin
 if p_disposition is distinct from 'INVITE' and p_disposition is distinct from 'IGNORE' then raise exception 'invalid_comment_disposition' using errcode='22023'; end if;
 select * into j from public.business_jobs where id=p_job_id for update;
 if j.kind is distinct from 'inbound_event' or j.status is distinct from 'running' or j.lease_owner is distinct from p_owner or j.lease_token is distinct from p_token then
  return jsonb_build_object('ok',false,'status','reject');
 end if;
 select * into e from public.facebook_inbound_events where id=j.entity_id and organization_id=j.organization_id;
 if not found or e.kind is distinct from 'comment' then raise exception 'invalid_comment_event' using errcode='22023'; end if;
 comment := e.data->>'comment_id';
 if comment is null or char_length(comment) not between 1 and 256 or e.sender_id is not distinct from e.page_id then
  return jsonb_build_object('ok',true,'skipped',true);
 end if;
 request := gen_random_uuid();
 digest := encode(sha256(convert_to(jsonb_build_object('pageId',e.page_id,'commentId',comment,'disposition',p_disposition,'text',case when p_disposition='INVITE' then invite else '' end)::text,'UTF8')),'hex');
 insert into public.public_comment_invitations(organization_id,page_id,comment_id,inbound_event_id,disposition,text,payload_hash,request_key,status)
 values(e.organization_id,e.page_id,comment,e.id,p_disposition,case when p_disposition='INVITE' then invite else null end,digest,request,case when p_disposition='INVITE' then 'PENDING' else 'IGNORED' end)
 on conflict(organization_id,page_id,comment_id) do nothing returning id into invitation_id;
 if invitation_id is null then return jsonb_build_object('ok',true,'duplicate',true); end if;
 if p_disposition='INVITE' then
  perform public.enqueue_business_job(e.organization_id,'outbound_comment',invitation_id,request,clock_timestamp(),5);
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(e.organization_id,'system','comment.queued','public_comment_invitation',invitation_id,'invite',e.id,invitation_id);
 else
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(e.organization_id,'system','comment.ignored','public_comment_invitation',invitation_id,'ignore',e.id,invitation_id);
 end if;
 return jsonb_build_object('ok',true,'disposition',p_disposition);
end $$;

create function public.claim_public_comment_send_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp())
returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b where b.kind='outbound_comment' and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now)) order by b.available_at,b.id for update of b skip locked loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *;
  return;
  end if;
 end loop;
end $$;

create function public.authorize_public_comment_send(p_job_id uuid, p_owner uuid, p_token uuid, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; o public.public_comment_invitations;
begin
 if p_now is null then raise exception 'invalid_comment_clock' using errcode='22023'; end if;
 select * into j from public.business_jobs where id=p_job_id for update;
 if j.kind is distinct from 'outbound_comment' or j.status is distinct from 'running' or j.lease_owner is distinct from p_owner or j.lease_token is distinct from p_token then
  return jsonb_build_object('action','reject');
 end if;
 select * into o from public.public_comment_invitations where id=j.entity_id for update;
 if not found then raise exception 'public_comment_invitation_missing' using errcode='22023'; end if;
 if o.status in ('SENT','FAILED','SUPPRESSED','UNKNOWN','IGNORED') then
  return jsonb_build_object('action','done','status',o.status,'errorCode',o.error_code,'remoteId',o.remote_id);
 end if;
 if o.status='SENDING' then
  update public.public_comment_invitations set status='UNKNOWN',error_code='unknown',lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','comment.unknown','public_comment_invitation',o.id,'unknown',o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('action','done','status','UNKNOWN','errorCode','unknown');
 end if;
 if o.disposition is distinct from 'INVITE' or o.text is distinct from 'Cảm ơn bạn đã quan tâm. Vui lòng nhắn tin riêng cho Page để được hỗ trợ.' then
  update public.public_comment_invitations set status='SUPPRESSED',error_code=null,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  return jsonb_build_object('action','done','status','SUPPRESSED');
 end if;
 if o.attempt>=o.max_attempts then
  update public.public_comment_invitations set status='FAILED',error_code='exhausted',lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  return jsonb_build_object('action','done','status','FAILED','errorCode','exhausted');
 end if;
 update public.public_comment_invitations set status='SENDING',attempt=attempt+1,lease_owner=p_owner,lease_token=p_token,lease_expires_at=j.lease_expires_at,error_code=null,updated_at=p_now where id=o.id returning * into o;
 return jsonb_build_object('action','send','pageId',o.page_id,'commentId',o.comment_id,'text',o.text,'attempt',o.attempt);
end $$;

create function public.complete_public_comment_send(p_job_id uuid, p_owner uuid, p_token uuid, p_result jsonb, p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; o public.public_comment_invitations; outcome text; code text; remote text; retry boolean:=false;
begin
 if p_now is null or p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'invalid_comment_result' using errcode='22023'; end if;
 select * into j from public.business_jobs where id=p_job_id for update;
 select * into o from public.public_comment_invitations where id=j.entity_id for update;
 if o.status is distinct from 'SENDING' or o.lease_owner is distinct from p_owner or o.lease_token is distinct from p_token or j.status is distinct from 'running' or j.lease_owner is distinct from p_owner or j.lease_token is distinct from p_token then
  return jsonb_build_object('ok',false,'status',o.status);
 end if;
 outcome := p_result->>'outcome';
 code := p_result->>'errorCode';
 remote := p_result->>'remoteId';
 if outcome='accepted' and char_length(remote) between 1 and 256 then
  update public.public_comment_invitations set status='SENT',remote_id=remote,error_code=null,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','comment.accepted','public_comment_invitation',o.id,'accepted',o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('ok',true,'status','SENT','retry',false);
 end if;
 if outcome='accepted' then code:='malformed'; outcome:='unknown'; end if;
 if outcome='unknown' then
  if code is null or code not in ('malformed','timeout','unknown') then code:='unknown'; end if;
  update public.public_comment_invitations set status='UNKNOWN',error_code=code,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','comment.unknown','public_comment_invitation',o.id,code,o.inbound_event_id,gen_random_uuid());
  return jsonb_build_object('ok',true,'status','UNKNOWN','retry',false);
 end if;
 if outcome<>'rejected' or code is null or code not in ('permission','invalid_parameter','token','unreachable','rate_limit','window') then
  update public.public_comment_invitations set status='UNKNOWN',error_code='unknown',lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  return jsonb_build_object('ok',true,'status','UNKNOWN','retry',false);
 end if;
 retry := code='rate_limit' and o.attempt<o.max_attempts;
 if retry then
  update public.public_comment_invitations set status='PENDING',error_code=code,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
 else
  update public.public_comment_invitations set status='FAILED',error_code=code,lease_owner=null,lease_token=null,lease_expires_at=null,updated_at=p_now where id=o.id;
  insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(o.organization_id,'system','comment.failed','public_comment_invitation',o.id,code,o.inbound_event_id,gen_random_uuid());
 end if;
 return jsonb_build_object('ok',true,'status',case when retry then 'PENDING' else 'FAILED' end,'retry',retry);
end $$;

revoke all on function public.claim_public_comment_job(uuid,integer,timestamptz), public.record_public_comment_disposition(uuid,uuid,uuid,text), public.claim_public_comment_send_job(uuid,integer,timestamptz), public.authorize_public_comment_send(uuid,uuid,uuid,timestamptz), public.complete_public_comment_send(uuid,uuid,uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.claim_public_comment_job(uuid,integer,timestamptz), public.record_public_comment_disposition(uuid,uuid,uuid,text), public.claim_public_comment_send_job(uuid,integer,timestamptz), public.authorize_public_comment_send(uuid,uuid,uuid,timestamptz), public.complete_public_comment_send(uuid,uuid,uuid,jsonb,timestamptz) to service_role;
