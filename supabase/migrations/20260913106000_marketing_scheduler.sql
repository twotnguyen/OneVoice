-- SPDX-License-Identifier: Apache-2.0
-- OV-036: claim/schedule slots, bounded skip/replacement, never PUBLISHED.
alter table public.campaign_slots
  add column if not exists claimed_request uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists replaced_slot_id uuid unique references public.campaign_slots(id),
  add column if not exists decision_reason text;

create table if not exists public.marketing_tick_receipts (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id),
 expected_revision integer not null, document jsonb not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create trigger marketing_tick_receipts_immutable before update or delete on public.marketing_tick_receipts for each row execute function public.reject_audit_mutation();
create trigger marketing_tick_receipts_no_truncate before truncate on public.marketing_tick_receipts for each statement execute function public.reject_audit_mutation();
alter table public.marketing_tick_receipts enable row level security;
revoke all on public.marketing_tick_receipts from public,anon,authenticated,service_role;
grant select on public.marketing_tick_receipts to service_role;
create policy marketing_tick_receipts_server on public.marketing_tick_receipts for select to service_role using(true);

create or replace function public.internal_tick_dedup(p_org uuid, p_bucket bigint) returns uuid language sql immutable set search_path='' as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,13,3)||'-8'||substr(h,17,3)||'-'||substr(h,21,12))::uuid
 from (select md5(p_org::text||':automation_tick:'||p_bucket::text) as h) s
$$;

create or replace function public.inspect_campaign_source(p_org uuid, p_campaign uuid) returns jsonb language plpgsql set search_path='' as $$
declare c public.campaigns; current jsonb;
begin
 select * into c from public.campaigns where id=p_campaign and organization_id=p_org;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 if c.source_kind='product' then
  begin current:=public.internal_campaign_product(p_org,c.source_ref::uuid);
  exception when sqlstate '22023' then return jsonb_build_object('health','stale_stock'); end;
  if coalesce((select jsonb_agg(value->>'priceVnd' order by value->>'id') from jsonb_array_elements(c.source_snapshot->'skus')),'[]')
     is distinct from coalesce((select jsonb_agg(value->>'priceVnd' order by value->>'id') from jsonb_array_elements(current->'skus')),'[]')
  then return jsonb_build_object('health','price_changed','current',current); end if;
  return jsonb_build_object('health','ok','current',current);
 elsif c.source_kind='program' then
  begin current:=public.internal_campaign_program(p_org,c.source_ref::uuid);
  exception when sqlstate '22023' then return jsonb_build_object('health','expired_promo'); end;
  return jsonb_build_object('health','ok','current',current);
 else
  if c.source_snapshot->>'expiresAt' is not null and (c.source_snapshot->>'expiresAt')::timestamptz<=clock_timestamp() then
   return jsonb_build_object('health','expired_promo');
  end if;
  if c.source_snapshot->'observation'->>'expiresAt' is not null and (c.source_snapshot->'observation'->>'expiresAt')::timestamptz<=clock_timestamp() then
   return jsonb_build_object('health','expired_promo');
  end if;
  return jsonb_build_object('health','ok');
 end if;
end $$;

create or replace function public.internal_slot_eligible(p_control public.marketing_control, p_campaign public.campaigns) returns boolean language sql immutable set search_path='' as $$
 select p_campaign.status in ('PLANNED','ACTIVE') and (
  (p_campaign.priority and p_control.status='PAUSED' and p_control.priority_campaign_id=p_campaign.id)
  or (not p_campaign.priority and p_control.status='RUNNING' and p_control.priority_campaign_id is null)
 )
$$;

create or replace function public.internal_next_slot_at(p_tz text, p_now timestamptz, p_cap integer, p_windows jsonb, p_org uuid) returns timestamptz language plpgsql set search_path='' as $$
declare local_now timestamp; d date; w jsonb; start_local timestamp; end_local timestamp; used integer; cap integer:=greatest(1,least(coalesce(p_cap,1),30));
begin
 local_now:=timezone(p_tz,p_now);
 for i in 0..13 loop
  d:=(local_now::date + i);
  select count(*)::integer into used from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id
   where c.organization_id=p_org and s.scheduled_at is not null and s.status not in ('SKIPPED','FAILED')
     and timezone(p_tz,s.scheduled_at)::date=d;
  for w in select value from jsonb_array_elements(p_windows) order by value->>'start' loop
   if used>=cap then exit; end if;
   start_local:=d+(w->>'start')::time; end_local:=d+(w->>'end')::time;
   if end_local<=local_now then continue; end if;
   if start_local<local_now then start_local:=date_trunc('minute',local_now)+interval '1 minute'; end if;
   if start_local>=end_local then continue; end if;
   return timezone(p_tz,start_local);
  end loop;
 end loop;
 return null;
end $$;

create or replace function public.internal_slot_record(p_slot public.campaign_slots, p_campaign public.campaigns, p_health text, p_generate uuid, p_decision uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',p_slot.id,'campaignId',p_campaign.id,'priority',p_campaign.priority,'campaignStatus',p_campaign.status,'status',p_slot.status,
  'scheduledAt',p_slot.scheduled_at,'contentVersionId',p_slot.content_version_id,'contentRevision',p_slot.content_revision,
  'replacedSlotId',p_slot.replaced_slot_id,'generateRequestId',p_generate,'decisionRequestId',p_decision,'sourceHealth',p_health
 )
$$;

create or replace function public.claim_marketing_tick(p_org uuid, p_request uuid, p_now timestamptz, p_revision integer default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='8s' as $$
declare prior public.marketing_tick_receipts; control public.marketing_control; settings public.business_settings;
 tz text; timing text; cap integer; windows jsonb; local_now timestamp; slot public.campaign_slots; campaign public.campaigns;
 at timestamptz; health jsonb; generate_id uuid; decision_id uuid; slots jsonb:='[]'::jsonb; result jsonb; ids jsonb:='[]'::jsonb;
begin
 if p_org is null or p_request is null or p_now is null then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,360));
 select * into prior from public.marketing_tick_receipts where request_id=p_request;
 if found then
  if prior.organization_id is distinct from p_org then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
  return prior.result;
 end if;
 insert into public.marketing_control(organization_id) values(p_org) on conflict do nothing;
 select * into control from public.marketing_control where organization_id=p_org for update;
 if p_revision is not null and control.revision<>p_revision then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 select * into settings from public.business_settings where organization_id=p_org for share;
 if not found then raise exception 'SETTINGS_REQUIRED' using errcode='22023'; end if;
 tz:=settings.settings->>'timezone'; timing:=settings.settings->>'timingMode';
 if timing='constrained' then cap:=least(greatest(coalesce((settings.settings->>'dailyCap')::integer,1),1),30); windows:=settings.settings->'windows';
 else cap:=1; windows:='[{"start":"10:00","end":"16:00"}]'::jsonb; end if;
 if windows is null or jsonb_typeof(windows)<>'array' then windows:='[{"start":"10:00","end":"16:00"}]'::jsonb; end if;
 local_now:=timezone(tz,p_now);

 for slot in
  select s.* from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id
  where c.organization_id=p_org and public.internal_slot_eligible(control,c) and s.status='PLANNED' and s.scheduled_at is not null
    and timezone(tz,s.scheduled_at)::date<local_now::date
  order by s.scheduled_at,s.id for update of s skip locked
 loop
  update public.campaign_slots set status='SKIPPED',decision_reason='missed_window',claimed_request=null,claimed_at=null where id=slot.id;
  if slot.replaced_slot_id is null and not exists(select 1 from public.campaign_slots r where r.replaced_slot_id=slot.id) then
   insert into public.campaign_slots(campaign_id,ordinal,replaced_slot_id)
    select slot.campaign_id, coalesce((select max(ordinal) from public.campaign_slots where campaign_id=slot.campaign_id),0)+1, slot.id
    where coalesce((select max(ordinal) from public.campaign_slots where campaign_id=slot.campaign_id),0)<100;
  end if;
 end loop;

 for slot in
  select s.* from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id
  where c.organization_id=p_org and public.internal_slot_eligible(control,c) and s.status='PLANNED' and s.scheduled_at is null
  order by c.created_at,s.ordinal,s.id for update of s skip locked
 loop
  at:=public.internal_next_slot_at(tz,p_now,cap,windows,p_org);
  if at is null then exit; end if;
  update public.campaign_slots set scheduled_at=at where id=slot.id;
 end loop;

 for slot in
  select s.* from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id
  where c.organization_id=p_org and public.internal_slot_eligible(control,c) and s.status in ('PLANNED','READY')
    and s.scheduled_at is not null and s.scheduled_at<=p_now and timezone(tz,s.scheduled_at)::date=local_now::date
    and (s.status='READY' or s.claimed_request is null or s.claimed_request=p_request or s.claimed_at<p_now-interval '2 minutes')
  order by s.scheduled_at,s.id for update of s skip locked
 loop
  select * into campaign from public.campaigns where id=slot.campaign_id;
  if slot.status='PLANNED' then
   update public.campaign_slots set claimed_request=p_request, claimed_at=p_now where id=slot.id returning * into slot;
  end if;
  health:=public.inspect_campaign_source(p_org,campaign.id);
  generate_id:=coalesce((
    select (r.document->>'generateRequestId')::uuid from public.campaign_receipts r
    where r.campaign_id=campaign.id and r.command='slot_prepare' and (r.document->>'slotId')=slot.id::text
    order by r.created_at limit 1
  ), gen_random_uuid());
  decision_id:=coalesce((
    select (r.document->>'decisionRequestId')::uuid from public.campaign_receipts r
    where r.campaign_id=campaign.id and r.command='slot_prepare' and (r.document->>'slotId')=slot.id::text
    order by r.created_at limit 1
  ), gen_random_uuid());
  insert into public.campaign_receipts(request_id,organization_id,campaign_id,command,expected_revision,document,result)
   values(generate_id,p_org,campaign.id,'slot_prepare',control.revision,
    jsonb_build_object('slotId',slot.id,'generateRequestId',generate_id,'decisionRequestId',decision_id),
    jsonb_build_object('slotId',slot.id))
   on conflict(request_id) do nothing;
  slots:=slots||jsonb_build_array(public.internal_slot_record(slot,campaign,coalesce(health->>'health','ok'),generate_id,decision_id));
  ids:=ids||jsonb_build_array(slot.id);
 end loop;

 result:=jsonb_build_object(
  'control',jsonb_build_object('status',control.status,'revision',control.revision,'priorityId',control.priority_campaign_id),
  'timezone',tz,'slots',slots);
 insert into public.marketing_tick_receipts(request_id,organization_id,expected_revision,document,result)
  values(p_request,p_org,control.revision,jsonb_build_object('now',p_now,'slotIds',ids),result);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_org,'system','scheduler.tick','organization',p_org,'scheduler.claim',p_request,p_request)
  on conflict(idempotency_key) do nothing;
 return result;
end $$;

create or replace function public.apply_slot_decision(p_org uuid, p_slot uuid, p_campaign uuid, p_request uuid, p_revision integer, p_document jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='8s' as $$
declare prior public.campaign_receipts; control public.marketing_control; slot public.campaign_slots; campaign public.campaigns;
 action text; reason text; replacement uuid; next_ord integer; result jsonb;
begin
 if p_request is null or p_document is null or jsonb_typeof(p_document)<>'object' then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
 action:=p_document->>'action'; reason:=coalesce(nullif(p_document->>'reason',''),'prepared');
 if action is null or action not in ('ready','skipped') or action='published' then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,361));
 select * into prior from public.campaign_receipts where request_id=p_request;
 if found then
  if row(prior.organization_id,prior.campaign_id,prior.command) is distinct from row(p_org,p_campaign,'slot_decision') then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
  return prior.result;
 end if;
 select * into control from public.marketing_control where organization_id=p_org for update;
 if not found or control.revision<>p_revision then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 select * into campaign from public.campaigns where id=p_campaign and organization_id=p_org for share;
 if not found or campaign.status not in ('PLANNED','ACTIVE') then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 if not public.internal_slot_eligible(control,campaign) then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 select * into slot from public.campaign_slots where id=p_slot and campaign_id=p_campaign for update;
 if not found or slot.status in ('PUBLISHED','SKIPPED','FAILED') then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 if action='ready' then
  update public.campaign_slots set status='READY', decision_reason=reason, claimed_request=null, claimed_at=null,
   content_version_id=coalesce((p_document->>'contentVersionId')::uuid, content_version_id) where id=slot.id returning * into slot;
 else
  update public.campaign_slots set status='SKIPPED', decision_reason=reason, claimed_request=null, claimed_at=null where id=slot.id returning * into slot;
  if coalesce((p_document->>'replace')::boolean,false) and slot.replaced_slot_id is null and not exists(select 1 from public.campaign_slots r where r.replaced_slot_id=slot.id) then
   select coalesce(max(ordinal),0)+1 into next_ord from public.campaign_slots where campaign_id=slot.campaign_id;
   if next_ord between 1 and 100 then
    insert into public.campaign_slots(campaign_id,ordinal,replaced_slot_id) values(slot.campaign_id,next_ord,slot.id) returning id into replacement;
   end if;
  end if;
 end if;
 if slot.status='PUBLISHED' then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
 result:=jsonb_build_object('slotId',slot.id,'status',slot.status,'reason',reason,'contentVersionId',slot.content_version_id,'replacementId',replacement);
 insert into public.campaign_receipts(request_id,organization_id,campaign_id,command,expected_revision,document,result)
  values(p_request,p_org,p_campaign,'slot_decision',p_revision,p_document,result);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_org,'system','scheduler.slot','campaign_slot',slot.id,'scheduler.'||action,p_request,p_request)
  on conflict(idempotency_key) do nothing;
 return result;
end $$;

create or replace function public.complete_priority_control(p_org uuid, p_campaign uuid, p_request uuid, p_revision integer) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='8s' as $$
declare prior public.campaign_receipts; control public.marketing_control; result jsonb;
begin
 if p_request is null then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,362));
 select * into prior from public.campaign_receipts where request_id=p_request;
 if found then
  if row(prior.organization_id,prior.campaign_id,prior.command) is distinct from row(p_org,p_campaign,'complete_priority') then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
  return prior.result;
 end if;
 select * into control from public.marketing_control where organization_id=p_org for update;
 if not found or control.revision<>p_revision then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 if control.priority_campaign_id is distinct from p_campaign then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 update public.marketing_control set status='PAUSED', priority_campaign_id=null, revision=revision+1, reason='priority_finished', updated_at=clock_timestamp()
  where organization_id=p_org returning revision into p_revision;
 result:=jsonb_build_object('status','PAUSED','priorityId',null,'revision',p_revision);
 insert into public.campaign_receipts(request_id,organization_id,campaign_id,command,expected_revision,document,result)
  values(p_request,p_org,p_campaign,'complete_priority',control.revision,'{}'::jsonb,result);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_org,'system','scheduler.priority_finished','campaign',p_campaign,'priority.complete',p_request,p_request)
  on conflict(idempotency_key) do nothing;
 return result;
end $$;

create or replace function public.priority_pending_slots(p_org uuid, p_campaign uuid) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.campaigns where id=p_campaign and organization_id=p_org) then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 select count(*)::integer into n from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id
  where c.id=p_campaign and c.organization_id=p_org and s.status in ('PLANNED','CLAIMED');
 return n;
end $$;

create or replace function public.enqueue_due_automation_ticks() returns integer language plpgsql security definer set search_path='' as $$
declare control public.marketing_control; n integer:=0; bucket bigint:=floor(extract(epoch from clock_timestamp())/60); dedup uuid;
begin
 for control in select * from public.marketing_control order by organization_id limit 50 for update skip locked loop
  dedup:=public.internal_tick_dedup(control.organization_id,bucket);
  perform public.enqueue_business_job(control.organization_id,'automation_tick',control.organization_id,dedup,clock_timestamp(),3);
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function public.claim_automation_tick(p_owner uuid) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; t timestamptz:=clock_timestamp();
begin
 if p_owner is null then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
 for j in select * from public.business_jobs where kind='automation_tick' and ((status='queued' and available_at<=t) or (status='running' and lease_expires_at<=t)) order by available_at,id for update skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=t+interval '60 seconds',attempt_started_at=t,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *; return;
  end if;
 end loop;
end $$;

create or replace function public.claim_business_job(p_owner uuid, p_lease_seconds integer default 60, p_now timestamptz default clock_timestamp()) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b
  where b.kind not in('knowledge_ingest','render_content','outbound_message','outbound_comment','automation_tick')
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

revoke all on function public.internal_tick_dedup(uuid,bigint), public.internal_slot_eligible(public.marketing_control,public.campaigns), public.internal_next_slot_at(text,timestamptz,integer,jsonb,uuid), public.internal_slot_record(public.campaign_slots,public.campaigns,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.inspect_campaign_source(uuid,uuid), public.claim_marketing_tick(uuid,uuid,timestamptz,integer), public.apply_slot_decision(uuid,uuid,uuid,uuid,integer,jsonb), public.complete_priority_control(uuid,uuid,uuid,integer), public.priority_pending_slots(uuid,uuid), public.enqueue_due_automation_ticks(), public.claim_automation_tick(uuid) from public,anon,authenticated,service_role;
grant execute on function public.inspect_campaign_source(uuid,uuid), public.claim_marketing_tick(uuid,uuid,timestamptz,integer), public.apply_slot_decision(uuid,uuid,uuid,uuid,integer,jsonb), public.complete_priority_control(uuid,uuid,uuid,integer), public.priority_pending_slots(uuid,uuid), public.enqueue_due_automation_ticks(), public.claim_automation_tick(uuid) to service_role;
