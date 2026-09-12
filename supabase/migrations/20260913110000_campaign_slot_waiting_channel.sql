-- SPDX-License-Identifier: Apache-2.0
-- OV-061: WAITING_CHANNEL for due slots without a Facebook publishing provider. Never PUBLISHED.
do $$
declare n text;
begin
  select conname into n from pg_constraint
   where conrelid='public.campaign_slots'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%PLANNED%READY%CLAIMED%PUBLISHED%SKIPPED%FAILED%'
   limit 1;
  if n is not null then execute format('alter table public.campaign_slots drop constraint %I', n); end if;
end $$;
alter table public.campaign_slots drop constraint if exists campaign_slots_status_check;
alter table public.campaign_slots add constraint campaign_slots_status_check
  check (status in ('PLANNED','READY','CLAIMED','PUBLISHED','SKIPPED','FAILED','WAITING_CHANNEL'));

create or replace function public.save_content_version(p_org uuid,p_slot uuid,p_id uuid,p_request uuid,p_expected integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare prior public.content_versions; slot public.campaign_slots; campaign public.campaigns; source jsonb;
begin
 if p_request is null or p_id is null or p_expected is null or p_expected not between 0 and 2147483646 then raise exception 'CONTENT_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,320));
 select * into prior from public.content_versions where request_id=p_request;
 if found then
  if row(prior.organization_id,prior.slot_id,prior.id,prior.version,prior.document) is distinct from row(p_org,p_slot,p_id,p_expected+1,p_document) then raise exception 'CONTENT_CONFLICT' using errcode='40001'; end if;
  return jsonb_build_object('id',prior.id,'version',prior.version,'contentHash',prior.content_hash);
 end if;
 select c.* into campaign from public.campaigns c join public.campaign_slots s on s.campaign_id=c.id where s.id=p_slot and c.organization_id=p_org for share of c;
 if not found then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
 select * into slot from public.campaign_slots where id=p_slot for update;
 if slot.content_revision<>p_expected or slot.status not in('PLANNED','READY','WAITING_CHANNEL') or campaign.status not in('PLANNED','ACTIVE') then raise exception 'CONTENT_CONFLICT' using errcode='40001'; end if;
 perform public.internal_check_content(p_org,p_document);
 if campaign.source_kind='product' and not exists(select 1 from jsonb_array_elements(p_document->'evidence') e where e->>'kind'='product' and e->>'id'=campaign.source_ref) then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
 if campaign.source_kind='program' and not exists(select 1 from jsonb_array_elements(p_document->'evidence') e where e->>'kind'='program' and e->>'id'=campaign.source_ref) then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
 if campaign.source_kind='trend' and not exists(select 1 from jsonb_array_elements(p_document->'evidence') e where e->>'kind'='trend' and e->>'id'=campaign.source_snapshot->>'runId' and e->>'fingerprint'=campaign.source_snapshot->'observation'->>'fingerprint') then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
 for source in select value from jsonb_array_elements(p_document->'evidence') loop
  if campaign.source_kind='product' and source->>'kind'='product' and source->>'id'<>campaign.source_ref then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
  if source->>'kind'='knowledge' and jsonb_array_length(source->'snapshot'->'productIds')>0 and (campaign.source_kind<>'product' or not (source->'snapshot'->'productIds') ? campaign.source_ref) then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
  if campaign.source_kind='product' and source->>'kind'='program' and source->'snapshot'->>'scope'<>'all' and not (source->'snapshot'->'productIds') ? campaign.source_ref then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
  if campaign.source_kind='program' and source->>'kind'='program' and source->>'id'<>campaign.source_ref then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
  if campaign.source_kind='program' and source->>'kind'='product' and not exists(select 1 from jsonb_array_elements(p_document->'evidence') p where p->>'kind'='program' and p->>'id'=campaign.source_ref and (p->'snapshot'->>'scope'='all' or (p->'snapshot'->'productIds') ? (source->>'id'))) then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
 end loop;
 insert into public.content_versions(id,organization_id,slot_id,version,request_id,document,content_hash) values(p_id,p_org,p_slot,p_expected+1,p_request,p_document,p_document->>'contentHash');
 update public.campaign_slots set content_version_id=p_id,content_revision=p_expected+1 where id=p_slot;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key) values(p_org,'system','content.created','content_version',p_id,'content.validated',p_request,p_request);
 perform public.internal_check_content(p_org,p_document);
 return jsonb_build_object('id',p_id,'version',p_expected+1,'contentHash',p_document->>'contentHash');
end $$;

create or replace function public.check_content_version(p_org uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare content public.content_versions; slot public.campaign_slots; campaign public.campaigns;
begin
 select * into content from public.content_versions where id=p_id and organization_id=p_org;
 if not found then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
 select c.* into campaign from public.campaigns c join public.campaign_slots s on s.campaign_id=c.id where s.id=content.slot_id for share of c;
 select * into slot from public.campaign_slots where id=content.slot_id for share;
 if slot.content_version_id is distinct from content.id or campaign.status not in('PLANNED','ACTIVE') or slot.status not in('PLANNED','READY','WAITING_CHANNEL') then raise exception 'CONTENT_CONFLICT' using errcode='40001'; end if;
 perform public.internal_check_content(p_org,content.document);
 return jsonb_build_object('id',content.id,'contentHash',content.content_hash,'checkedAt',clock_timestamp(),'artifactHash',null);
end $$;

create or replace function public.apply_slot_decision(p_org uuid, p_slot uuid, p_campaign uuid, p_request uuid, p_revision integer, p_document jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='8s' as $$
declare prior public.campaign_receipts; control public.marketing_control; slot public.campaign_slots; campaign public.campaigns;
 action text; reason text; replacement uuid; next_ord integer; result jsonb; version_id uuid;
begin
 if p_request is null or p_document is null or jsonb_typeof(p_document)<>'object' then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
 action:=p_document->>'action'; reason:=coalesce(nullif(p_document->>'reason',''),'prepared');
 if action is null or action not in ('ready','skipped','waiting_channel') or action='published' then raise exception 'SCHEDULER_INVALID' using errcode='22023'; end if;
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
 if action<>'waiting_channel' and slot.status='WAITING_CHANNEL' then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
 if action='waiting_channel' then
  if slot.status='WAITING_CHANNEL' then
   result:=jsonb_build_object('slotId',slot.id,'status',slot.status,'reason',coalesce(slot.decision_reason,reason),'contentVersionId',slot.content_version_id,'replacementId',null);
   return result;
  end if;
  version_id:=coalesce((p_document->>'contentVersionId')::uuid, slot.content_version_id);
  if version_id is null then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
  if exists(select 1 from public.render_jobs j where j.content_version_id=version_id)
     and not exists(
       select 1 from public.render_receipts r
       where r.content_version_id=version_id and r.slot_id=slot.id and r.status='succeeded' and r.artifact_hash is not null
     )
  then raise exception 'SCHEDULER_CONFLICT' using errcode='40001'; end if;
  update public.campaign_slots set status='WAITING_CHANNEL', decision_reason=reason, claimed_request=null, claimed_at=null,
   content_version_id=version_id where id=slot.id returning * into slot;
 elsif action='ready' then
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

create or replace function public.unschedule_campaign_slot(p_org uuid, p_actor uuid, p_slot uuid, p_request uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='8s' as $$
declare prior public.campaign_receipts; slot public.campaign_slots; campaign public.campaigns; result jsonb;
begin
 if p_request is null or p_slot is null then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
 perform 1 from public.staff_profiles where user_id=p_actor and organization_id=p_org and active and role='manager' for share;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,363));
 select * into prior from public.campaign_receipts where request_id=p_request;
 if found then
  if row(prior.organization_id,prior.command) is distinct from row(p_org,'unschedule') then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if;
  return prior.result;
 end if;
 select s.* into slot from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id
  where s.id=p_slot and c.organization_id=p_org;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 select * into campaign from public.campaigns where id=slot.campaign_id and organization_id=p_org for share;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 select * into slot from public.campaign_slots where id=p_slot for update;
 if slot.status='PUBLISHED' then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if;
 if slot.status not in ('READY','WAITING_CHANNEL') then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if;
 update public.campaign_slots set scheduled_at=null, decision_reason='unscheduled', claimed_request=null, claimed_at=null
  where id=slot.id returning * into slot;
 if slot.status='PUBLISHED' then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
 result:=jsonb_build_object('slotId',slot.id,'status',slot.status,'scheduledAt',slot.scheduled_at,'contentVersionId',slot.content_version_id,'reason','unscheduled');
 insert into public.campaign_receipts(request_id,organization_id,campaign_id,actor_id,command,expected_revision,document,result)
  values(p_request,p_org,campaign.id,p_actor,'unschedule',campaign.version,jsonb_build_object('slotId',slot.id),result);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_org,'staff',p_actor,'campaign.unschedule','campaign_slot',slot.id,'manager.unschedule',p_request,p_request)
  on conflict(idempotency_key) do nothing;
 return result;
end $$;

create or replace function public.internal_slot_version_record(p_version public.content_versions) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',p_version.id,'version',p_version.version,'contentHash',p_version.content_hash,
  'caption',p_version.document#>>'{draft,post,caption}','hook',p_version.document#>>'{draft,post,hook}','cta',p_version.document#>>'{draft,post,cta}',
  'script',p_version.document#>'{draft,script}','validation',p_version.document->'validation','passportFields',p_version.document->'fields',
  'artifactHash',(select r.artifact_hash from public.render_receipts r where r.content_version_id=p_version.id and r.status='succeeded' limit 1)
 )
$$;

create or replace function public.internal_slot_record_history(p_slot public.campaign_slots) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',p_slot.id,'ordinal',p_slot.ordinal,'status',p_slot.status,'scheduledAt',p_slot.scheduled_at,
  'contentVersionId',p_slot.content_version_id,'contentRevision',p_slot.content_revision,'decisionReason',p_slot.decision_reason,
  'caption',v.document#>>'{draft,post,caption}','hook',v.document#>>'{draft,post,hook}','cta',v.document#>>'{draft,post,cta}',
  'script',v.document#>'{draft,script}','validation',v.document->'validation','passportFields',v.document->'fields',
  'artifactHash',(select r.artifact_hash from public.render_receipts r where r.content_version_id=p_slot.content_version_id and r.status='succeeded' limit 1),
  'versions',coalesce((select jsonb_agg(public.internal_slot_version_record(h) order by h.version) from public.content_versions h where h.slot_id=p_slot.id),'[]'::jsonb)
 )
 from (select 1) _slot
 left join public.content_versions v on v.id=p_slot.content_version_id
$$;

create or replace function public.internal_campaign_record(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'title',c.title,'objective',c.objective,'sourceKind',c.source_kind,'sourceRef',c.source_ref,'priority',c.priority,'status',c.status,'version',c.version,'timezone',c.timezone,'createdAt',c.created_at,'decision',c.decision,'sourceSnapshot',c.source_snapshot,'slots',(select coalesce(jsonb_agg(public.internal_slot_record_history(s) order by s.ordinal),'[]'::jsonb) from public.campaign_slots s where s.campaign_id=c.id)) from public.campaigns c where c.id=p_id
$$;

create or replace function public.read_slot_content_history(p_org uuid, p_actor uuid, p_slot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare slot public.campaign_slots;
begin
 perform 1 from public.staff_profiles where user_id=p_actor and organization_id=p_org and active and role in('manager','staff') for share;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 select s.* into slot from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id
  where s.id=p_slot and c.organization_id=p_org;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 return public.internal_slot_record_history(slot);
end $$;

revoke all on function public.unschedule_campaign_slot(uuid,uuid,uuid,uuid), public.read_slot_content_history(uuid,uuid,uuid), public.internal_slot_version_record(public.content_versions), public.internal_slot_record_history(public.campaign_slots) from public,anon,authenticated,service_role;
grant execute on function public.unschedule_campaign_slot(uuid,uuid,uuid,uuid), public.read_slot_content_history(uuid,uuid,uuid) to service_role;
