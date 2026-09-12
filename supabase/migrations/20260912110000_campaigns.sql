-- SPDX-License-Identifier: Apache-2.0
-- Persistence only. OV038 enables automation; OV036 schedules; OV032 owns content.
create table public.marketing_control (
 organization_id uuid primary key references public.organizations(id), status text not null default 'PAUSED' check(status in('RUNNING','PAUSED')),
 revision integer not null default 0 check(revision>=0), priority_campaign_id uuid, reason text not null default 'not_enabled', updated_at timestamptz not null default clock_timestamp(),
 check(status='PAUSED' or priority_campaign_id is null)
);
create table public.campaigns (
 id uuid primary key, organization_id uuid not null references public.organizations(id), title text not null,
 objective text not null check(objective in('engagement','messages','paid-orders','mixed')),
 source_kind text not null check(source_kind in('product','program','trend')), source_ref text not null,
 priority boolean not null, status text not null default 'PLANNED' check(status in('PLANNED','ACTIVE','COMPLETED','FAILED')),
 version integer not null default 1, decision jsonb, source_snapshot jsonb not null, settings_snapshot jsonb not null,
 timezone text not null, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check(priority or decision is not null)
);
alter table public.marketing_control add foreign key(priority_campaign_id) references public.campaigns(id);
create index campaigns_scope_created on public.campaigns(organization_id,created_at desc,id);
create table public.campaign_slots (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id), ordinal integer not null check(ordinal between 1 and 100),
 scheduled_at timestamptz, content_version_id uuid, status text not null default 'PLANNED' check(status in('PLANNED','READY','CLAIMED','PUBLISHED','SKIPPED','FAILED')),
 unique(campaign_id,ordinal)
);
create table public.campaign_receipts (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id), campaign_id uuid not null references public.campaigns(id),
 actor_id uuid, command text not null, expected_revision integer not null, document jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create trigger campaign_receipts_immutable before update or delete on public.campaign_receipts for each row execute function public.reject_audit_mutation();
create trigger campaign_receipts_no_truncate before truncate on public.campaign_receipts for each statement execute function public.reject_audit_mutation();
create function public.guard_campaign_snapshot() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or row(new.id,new.organization_id,new.title,new.objective,new.source_kind,new.source_ref,new.priority,new.decision,new.source_snapshot,new.settings_snapshot,new.timezone,new.created_at) is distinct from row(old.id,old.organization_id,old.title,old.objective,old.source_kind,old.source_ref,old.priority,old.decision,old.source_snapshot,old.settings_snapshot,old.timezone,old.created_at) then raise exception 'CAMPAIGN_IMMUTABLE' using errcode='55000'; end if; return new;
end $$;
create trigger campaign_snapshot_immutable before update or delete on public.campaigns for each row execute function public.guard_campaign_snapshot();
alter table public.marketing_control enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_slots enable row level security;
alter table public.campaign_receipts enable row level security;
revoke all on public.marketing_control,public.campaigns,public.campaign_slots,public.campaign_receipts from public,anon,authenticated,service_role;
grant select on public.marketing_control,public.campaigns,public.campaign_slots,public.campaign_receipts to service_role;
create policy control_server on public.marketing_control for select to service_role using(true);
create policy campaigns_server on public.campaigns for select to service_role using(true);
create policy slots_server on public.campaign_slots for select to service_role using(true);
create policy campaign_receipts_server on public.campaign_receipts for select to service_role using(true);

create function public.internal_campaign_product(p_org uuid,p_id uuid) returns jsonb language plpgsql set search_path='' as $$
declare p public.products; skus jsonb; has_variants boolean;
begin
 select * into p from public.products where id=p_id and organization_id=p_org for share;
 if not found or p.disabled_at is not null or p.currency<>'VND' then raise exception 'CAMPAIGN_SOURCE_INVALID' using errcode='22023'; end if;
 perform 1 from public.product_variants where product_id=p.id order by id for share;
 select exists(select 1 from public.product_variants where product_id=p.id) into has_variants;
 if has_variants then
  select jsonb_agg(jsonb_build_object('id',id,'priceVnd',price_vnd,'stockQuantity',stock_quantity) order by id) into skus from public.product_variants where product_id=p.id and disabled_at is null and in_stock and stock_quantity>0 and price_vnd>0;
 else
  if p.in_stock and p.stock_quantity>0 and p.price_vnd>0 then skus:=jsonb_build_array(jsonb_build_object('id',p.id,'priceVnd',p.price_vnd,'stockQuantity',p.stock_quantity)); end if;
 end if;
 if skus is null or jsonb_array_length(skus)>100 then raise exception 'CAMPAIGN_SOURCE_INVALID' using errcode='22023'; end if;
 return jsonb_build_object('id',p.id,'version',p.version,'name',p.name,'productType',p.product_type,'skus',skus);
end $$;
create function public.internal_campaign_program(p_org uuid,p_id uuid) returns jsonb language plpgsql set search_path='' as $$
declare p public.promotions; ids jsonb; linked uuid; eligible boolean:=false;
begin
 select * into p from public.promotions where id=p_id and organization_id=p_org for share;
 if not found or p.disabled_at is not null or (p.starts_at is not null and p.starts_at>clock_timestamp()) or (p.expires_at is not null and p.expires_at<=clock_timestamp()) then raise exception 'CAMPAIGN_SOURCE_INVALID' using errcode='22023'; end if;
 select coalesce(jsonb_agg(product_id order by product_id),'[]') into ids from public.product_promotions where promotion_id=p.id;
 if jsonb_array_length(ids)>100 then raise exception 'CAMPAIGN_SOURCE_INVALID' using errcode='22023'; end if;
 if p.scope='products' then
  for linked in select value::uuid from jsonb_array_elements_text(ids) loop
   begin perform public.internal_campaign_product(p_org,linked); eligible:=true; exception when sqlstate '22023' then null; end;
  end loop;
  if not eligible then raise exception 'CAMPAIGN_SOURCE_INVALID' using errcode='22023'; end if;
 end if;
 return jsonb_build_object('id',p.id,'version',p.version,'title',p.label,'body',coalesce(p.details_text,p.label),'scope',p.scope,'productIds',ids,'startsAt',p.starts_at,'expiresAt',p.expires_at,'discountType',p.discount_type,'discountValue',p.discount_value);
end $$;
-- Imports can change terms without incrementing the management version. Compare
-- the full operational program, normalizing timestamps and unordered product IDs.
create function public.internal_campaign_program_matches(p_expected jsonb,p_current jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_expected ?& array['id','version','title','body','active','scope','productIds','startsAt','expiresAt','discountType','discountValue']
 and p_expected->'active'='true'::jsonb
 and (p_expected-array['active','productIds','startsAt','expiresAt'])=(p_current-array['productIds','startsAt','expiresAt'])
 and (p_expected->>'startsAt')::timestamptz is not distinct from (p_current->>'startsAt')::timestamptz
 and (p_expected->>'expiresAt')::timestamptz is not distinct from (p_current->>'expiresAt')::timestamptz
 and (select jsonb_agg(value::uuid order by value::uuid) from jsonb_array_elements_text(p_expected->'productIds')) is not distinct from (select jsonb_agg(value::uuid order by value::uuid) from jsonb_array_elements_text(p_current->'productIds')),false)
$$;
create function public.internal_campaign_forbidden(p_text text,p_settings jsonb) returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from jsonb_array_elements_text(p_settings->'forbiddenTopics') t where strpos(lower(normalize(translate(p_text,chr(8203)||chr(8204)||chr(8205)||chr(65279),''),NFKC)),lower(normalize(t.value,NFKC)))>0)
$$;
create function public.internal_create_campaign(p_org uuid,p_actor uuid,p_id uuid,p_request uuid,p_revision integer,p_priority boolean,p_document jsonb)
returns jsonb language plpgsql set search_path='' set lock_timeout='8s' as $$
declare prior public.campaign_receipts; control public.marketing_control; settings public.business_settings; selected jsonb; facts jsonb; program jsonb; expected jsonb; title text; kind text; ref text; objective text; result jsonb; trend_run public.trend_ingestion_runs; source jsonb; observation jsonb; valid_trend boolean:=false; snapshot jsonb;
begin
 if p_id is null or p_request is null or p_revision is null or p_revision not between 0 and 2147483646 or p_document is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>1500000 then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,300));
 select * into prior from public.campaign_receipts where request_id=p_request;
 if found then
  if row(prior.organization_id,prior.campaign_id,prior.actor_id,prior.command,prior.expected_revision,prior.document) is distinct from row(p_org,p_id,p_actor,case when p_priority then 'priority' else 'opportunity' end,p_revision,p_document) then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if; return prior.result;
 end if;
 insert into public.marketing_control(organization_id) values(p_org) on conflict do nothing;
 select * into control from public.marketing_control where organization_id=p_org for update;
 if control.revision<>p_revision then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if;
 if control.priority_campaign_id is not null then raise exception 'PRIORITY_IN_PROGRESS' using errcode='40001'; end if;
 if not p_priority and control.status<>'RUNNING' then raise exception 'AUTOMATION_PAUSED' using errcode='42501'; end if;
 select * into settings from public.business_settings where organization_id=p_org for share;
 if not found then raise exception 'SETTINGS_REQUIRED' using errcode='22023'; end if;
 if p_priority then
  if (select count(*) from jsonb_object_keys(p_document))<>3 or not p_document ?& array['sourceKind','sourceId','objective'] then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
  kind:=p_document->>'sourceKind'; ref:=p_document->>'sourceId'; objective:=p_document->>'objective';
 else
  if not p_document ?& array['algorithmVersion','inputDigest','snapshot','decidedAt','selectedKey','ranked','excluded','ai','performanceStatus'] or p_document->>'algorithmVersion'<>'ov029-v1' or p_document->>'inputDigest' !~ '^[a-f0-9]{64}$' then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
  snapshot:=p_document->'snapshot';
  if jsonb_typeof(snapshot)<>'object' or not snapshot ?& array['organizationId','capturedAt','settings','products','programs','trends','recent','performance'] or jsonb_typeof(p_document->'ranked')<>'array' or jsonb_typeof(p_document->'excluded')<>'array' or jsonb_typeof(p_document->'ai')<>'object' or p_document->>'selectedKey' is null or p_document->>'decidedAt' is null or snapshot->>'capturedAt' is null then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
  if (snapshot->>'organizationId')::uuid<>p_org or (snapshot->>'capturedAt')::timestamptz>clock_timestamp() or (snapshot->>'capturedAt')::timestamptz<=clock_timestamp()-interval '5 minutes' or (p_document->>'decidedAt')::timestamptz>clock_timestamp() or snapshot->'settings' is distinct from jsonb_build_object('revision',settings.revision,'settings',settings.settings) then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
  select value into selected from jsonb_array_elements(p_document->'ranked') where value->>'key'=p_document->>'selectedKey';
  if selected is null or (selected->>'expiresAt' is not null and (selected->>'expiresAt')::timestamptz<=clock_timestamp()) then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
  if not selected ?& array['key','kind','title','evidence','operational','expiresAt','components','score'] or jsonb_typeof(selected->'evidence')<>'array' then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
  kind:=selected->>'kind'; ref:=substring(p_document->>'selectedKey' from position(':' in p_document->>'selectedKey')+1); objective:=settings.settings->>'objective';
 end if;
 if objective is null or objective not in('engagement','messages','paid-orders','mixed') or kind is null or kind not in('product','program','trend') or (p_priority and kind='trend') then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
 if kind in('product','program') then ref:=ref::uuid::text; end if;
 if not p_priority and exists(select 1 from public.campaigns where organization_id=p_org and source_kind=kind and source_ref=ref and created_at>clock_timestamp()-interval '7 days') then raise exception 'CAMPAIGN_RECENT' using errcode='40001'; end if;
 if kind='product' then
  if not p_priority and (jsonb_typeof(selected->'operational')<>'object' or not (selected->'operational') ?& array['skus','programs'] or jsonb_typeof(selected->'operational'->'skus')<>'array' or jsonb_typeof(selected->'operational'->'programs')<>'array') then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
  facts:=public.internal_campaign_product(p_org,ref::uuid); title:=facts->>'name';
  if not p_priority then
   select value into expected from jsonb_array_elements(snapshot->'products') where (value->>'id')::uuid=ref::uuid;
   if expected is null or expected->'version' is distinct from facts->'version' or expected->'name' is distinct from facts->'name' or expected->'productType' is distinct from facts->'productType' or selected->'operational'->'skus' is distinct from facts->'skus' then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
   for program in select value from jsonb_array_elements(selected->'operational'->'programs') loop
    expected:=public.internal_campaign_program(p_org,(program->>'id')::uuid);
    if not public.internal_campaign_program_matches(program,expected) then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
   end loop;
  end if;
 elsif kind='program' then
  if not p_priority and (jsonb_typeof(selected->'operational')<>'object' or selected->'operational'->>'version' is null) then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
  facts:=public.internal_campaign_program(p_org,ref::uuid); title:=facts->>'title';
  if not p_priority and not public.internal_campaign_program_matches(selected->'operational',facts) then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
 else
  select * into trend_run from public.trend_ingestion_runs where organization_id=p_org order by observed_at desc,id desc limit 1 for share;
  if not found or trend_run.id<>(snapshot->'trends'->>'runId')::uuid then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
  title:=selected->>'title';
  for source in select value from jsonb_array_elements(trend_run.snapshot->'sources') loop
   if source->>'status'='success' and (trend_run.snapshot->>'observedAt')::timestamptz+make_interval(secs=>(source->>'ttlSeconds')::integer)>clock_timestamp() then
    for observation in select value from jsonb_array_elements(source->'observations') loop
     if observation->>'topic'=title and selected->'evidence' ? ('observation:'||(observation->>'fingerprint')) and observation->>'timestampKind'<>'unknown' and observation->>'sourceTimestamp' is not null and (observation->>'sourceTimestamp')::timestamptz<=clock_timestamp() and (observation->>'expiresAt')::timestamptz>clock_timestamp() then valid_trend:=true; facts:=jsonb_build_object('runId',trend_run.id,'source',source,'observation',observation); end if;
    end loop;
   end if;
  end loop;
  if not valid_trend or not exists(select 1 from jsonb_array_elements_text(settings.settings->'allowedTopics') t where strpos(lower(normalize(title,NFKC)),lower(normalize(t.value,NFKC)))>0) then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
 end if;
 if public.internal_campaign_forbidden(title||' '||coalesce(facts->>'body','')||' '||coalesce(facts->>'productType',''),settings.settings) then raise exception 'CAMPAIGN_SOURCE_INVALID' using errcode='22023'; end if;
 insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,decision,source_snapshot,settings_snapshot,timezone)
 values(p_id,p_org,title,objective,kind,ref,p_priority,case when p_priority then null else p_document end,facts,jsonb_build_object('revision',settings.revision,'settings',settings.settings),settings.settings->>'timezone');
 insert into public.campaign_slots(campaign_id,ordinal) values(p_id,1);
 update public.marketing_control set revision=revision+1,status=case when p_priority then 'PAUSED' else status end,priority_campaign_id=case when p_priority then p_id else null end,reason=case when p_priority then 'priority_in_progress' else reason end,updated_at=clock_timestamp() where organization_id=p_org;
 result:=jsonb_build_object('id',p_id,'version',1,'controlRevision',p_revision+1);
 insert into public.campaign_receipts(request_id,organization_id,campaign_id,actor_id,command,expected_revision,document,result) values(p_request,p_org,p_id,p_actor,case when p_priority then 'priority' else 'opportunity' end,p_revision,p_document,result);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key) values(p_org,case when p_actor is null then 'system' else 'staff' end,p_actor,'campaign.created','campaign',p_id,case when p_priority then 'manager.priority' else 'opportunity.selected' end,p_request,p_request);
 if (kind='program' and facts->>'expiresAt' is not null and (facts->>'expiresAt')::timestamptz<=clock_timestamp()) or (not p_priority and ((snapshot->>'capturedAt')::timestamptz<=clock_timestamp()-interval '5 minutes' or (selected->>'expiresAt' is not null and (selected->>'expiresAt')::timestamptz<=clock_timestamp()))) then raise exception 'CAMPAIGN_STALE' using errcode='40001'; end if;
 return result;
end $$;
create function public.create_priority_campaign(p_org uuid,p_actor uuid,p_id uuid,p_request uuid,p_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.staff_profiles where user_id=p_actor and organization_id=p_org and active and role='manager' for share;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 return public.internal_create_campaign(p_org,p_actor,p_id,p_request,p_revision,true,p_document);
end $$;
create function public.create_opportunity_campaign(p_org uuid,p_id uuid,p_request uuid,p_revision integer,p_decision jsonb) returns jsonb language sql security definer set search_path='' as $$select public.internal_create_campaign(p_org,null,p_id,p_request,p_revision,false,p_decision)$$;
create function public.finish_campaign(p_org uuid,p_id uuid,p_request uuid,p_version integer,p_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.campaign_receipts; control public.marketing_control; c public.campaigns; result jsonb; doc jsonb:=jsonb_build_object('status',p_status);
begin
 if p_request is null or p_status is null or p_status not in('COMPLETED','FAILED') then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,300));
 select * into prior from public.campaign_receipts where request_id=p_request;
 if found then if row(prior.organization_id,prior.campaign_id,prior.command,prior.expected_revision,prior.document) is distinct from row(p_org,p_id,'finish',p_version,doc) then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if; return prior.result; end if;
 select * into control from public.marketing_control where organization_id=p_org for update;
 select * into c from public.campaigns where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 if p_version is null or c.version<>p_version or c.status not in('PLANNED','ACTIVE') then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if;
 if c.priority and control.priority_campaign_id is distinct from c.id then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if;
 update public.campaigns set status=p_status,version=version+1,updated_at=clock_timestamp() where id=p_id;
 if c.priority then update public.marketing_control set status='PAUSED',priority_campaign_id=null,revision=revision+1,reason='priority_finished',updated_at=clock_timestamp() where organization_id=p_org; end if;
 result:=jsonb_build_object('id',p_id,'version',p_version+1);
 insert into public.campaign_receipts(request_id,organization_id,campaign_id,command,expected_revision,document,result) values(p_request,p_org,p_id,'finish',p_version,doc,result);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key) values(p_org,'system','campaign.finished','campaign',p_id,'worker.terminal',p_request,p_request);
 return result;
end $$;
create function public.internal_campaign_record(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'title',c.title,'objective',c.objective,'sourceKind',c.source_kind,'sourceRef',c.source_ref,'priority',c.priority,'status',c.status,'version',c.version,'timezone',c.timezone,'createdAt',c.created_at,'decision',c.decision,'sourceSnapshot',c.source_snapshot,'slots',(select jsonb_agg(jsonb_build_object('id',s.id,'ordinal',s.ordinal,'status',s.status,'scheduledAt',s.scheduled_at,'contentVersionId',s.content_version_id) order by s.ordinal) from public.campaign_slots s where s.campaign_id=c.id)) from public.campaigns c where c.id=p_id
$$;
create function public.read_campaigns(p_org uuid,p_actor uuid,p_id uuid default null,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; control public.marketing_control;
begin
 perform 1 from public.staff_profiles where user_id=p_actor and organization_id=p_org and active and role in('manager','staff') for share;
 if not found then raise exception 'CAMPAIGN_FORBIDDEN' using errcode='42501'; end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'CAMPAIGN_INVALID' using errcode='22023'; end if;
 if p_id is not null then if not exists(select 1 from public.campaigns where id=p_id and organization_id=p_org) then return null; end if; return public.internal_campaign_record(p_id); end if;
 select * into control from public.marketing_control where organization_id=p_org;
 select jsonb_build_object('page',p_page,'total',(select count(*) from public.campaigns where organization_id=p_org),'control',jsonb_build_object('status',coalesce(control.status,'PAUSED'),'revision',coalesce(control.revision,0),'priorityId',control.priority_campaign_id,'reason',coalesce(control.reason,'not_enabled')),'items',coalesce(jsonb_agg(public.internal_campaign_record(c.id)-'decision'||'{"decision":null}'::jsonb),'[]'::jsonb)) into result from (select id from public.campaigns where organization_id=p_org order by created_at desc,id limit 20 offset (p_page-1)*20) c;
 return result;
end $$;
revoke all on function public.internal_campaign_product(uuid,uuid),public.internal_campaign_program(uuid,uuid),public.internal_campaign_program_matches(jsonb,jsonb),public.internal_campaign_forbidden(text,jsonb),public.internal_create_campaign(uuid,uuid,uuid,uuid,integer,boolean,jsonb),public.internal_campaign_record(uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_priority_campaign(uuid,uuid,uuid,uuid,integer,jsonb),public.create_opportunity_campaign(uuid,uuid,uuid,integer,jsonb),public.finish_campaign(uuid,uuid,uuid,integer,text),public.read_campaigns(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.create_priority_campaign(uuid,uuid,uuid,uuid,integer,jsonb),public.create_opportunity_campaign(uuid,uuid,uuid,integer,jsonb),public.finish_campaign(uuid,uuid,uuid,integer,text),public.read_campaigns(uuid,uuid,uuid,integer) to service_role;
