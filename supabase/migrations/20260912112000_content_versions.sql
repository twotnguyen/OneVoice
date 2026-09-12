-- OV032 validates content, not rendered artifacts or publish permission.
create table public.content_versions (
 id uuid primary key, organization_id uuid not null references public.organizations(id), slot_id uuid not null references public.campaign_slots(id),
 version integer not null check(version>0), request_id uuid not null unique, document jsonb not null,
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'), artifact_hash text check(artifact_hash is null),
 validated_at timestamptz not null default clock_timestamp(), unique(slot_id,version)
);
create trigger content_versions_immutable before update or delete on public.content_versions for each row execute function public.reject_audit_mutation();
create trigger content_versions_no_truncate before truncate on public.content_versions for each statement execute function public.reject_audit_mutation();
alter table public.campaign_slots add column content_revision integer not null default 0 check(content_revision>=0);
alter table public.campaign_slots add foreign key(content_version_id) references public.content_versions(id);
alter table public.content_versions enable row level security;
revoke all on public.content_versions from public,anon,authenticated,service_role;
grant select on public.content_versions to service_role;
create policy content_server on public.content_versions for select to service_role using(true);

create function public.internal_content_evidence(p_org uuid,p_source jsonb) returns jsonb language plpgsql set search_path='' as $$
declare p public.products; v public.product_variants; facts jsonb; canonical jsonb; specs jsonb; source jsonb; observation jsonb; run public.trend_ingestion_runs; sid uuid:=(p_source->>'id')::uuid; selected_sku uuid:=(p_source->>'skuId')::uuid;
begin
 case p_source->>'kind'
 when 'product' then
  select * into p from public.products where id=sid and organization_id=p_org for share;
  if not found or p.disabled_at is not null or p.currency<>'VND' then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
  perform 1 from public.product_variants where product_id=p.id order by id for share;
  if exists(select 1 from public.product_variants where product_id=p.id) then
   select * into v from public.product_variants where id=selected_sku and product_id=p.id and disabled_at is null;
   if not found or not coalesce(v.in_stock,false) or coalesce(v.stock_quantity,0)<=0 or coalesce(v.price_vnd,0)<=0 then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
   facts:=jsonb_build_object('skuId',v.id,'skuName',v.name,'priceVnd',v.price_vnd,'stockQuantity',v.stock_quantity);
  else
   if selected_sku is distinct from p.id or not coalesce(p.in_stock,false) or coalesce(p.stock_quantity,0)<=0 or coalesce(p.price_vnd,0)<=0 then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
   facts:=jsonb_build_object('skuId',p.id,'skuName',p.name,'priceVnd',p.price_vnd,'stockQuantity',p.stock_quantity);
  end if;
  canonical:=public.lookup_consultation_evidence(p_org,jsonb_build_object('operation','compare_products','items',jsonb_build_array(jsonb_build_object('productId',p.id,'variantId',v.id))))->'products'->0;
  if canonical is null then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
  select coalesce(jsonb_object_agg(name,value),'{}') into specs from (select lower(btrim(s->>'name')) name,min(btrim(s->>'value')) value from jsonb_array_elements(canonical->'specifications') s group by lower(btrim(s->>'name')) having count(distinct btrim(s->>'value'))=1) unique_specs;
  facts:=facts||jsonb_build_object('id',p.id,'version',p.version,'name',p.name,'brand',p.brand,'productType',p.product_type,'specifications',specs,'specificationsComplete',canonical->'specificationsComplete','specificationConflicts',exists(select 1 from jsonb_array_elements(canonical->'specifications') s group by lower(btrim(s->>'name')) having count(distinct btrim(s->>'value'))>1),'rawSpecifications',p.specifications,'variantOptions',v.options,'sourceUrl',p.source_url);
 when 'program' then facts:=public.internal_campaign_program(p_org,sid);
 when 'brand' then
  if sid<>p_org then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
  select jsonb_build_object('revision',revision,'brandName',settings->>'brandName','settings',settings) into facts from public.business_settings where organization_id=p_org for share;
 when 'knowledge' then
  perform 1 from public.knowledge_sources where id=sid and organization_id=p_org for share;
  if not found then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
  perform 1 from public.knowledge_ingestion_runs where source_id=sid order by refresh_cycle for share;
  facts:=public.read_current_knowledge(p_org,sid);
 when 'trend' then
  select * into run from public.trend_ingestion_runs where organization_id=p_org order by observed_at desc,id desc limit 1 for share;
  if not found or run.id<>sid then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
  for source in select value from jsonb_array_elements(run.snapshot->'sources') loop
   if source->>'status'='success' and (run.snapshot->>'observedAt')::timestamptz+make_interval(secs=>(source->>'ttlSeconds')::integer)>clock_timestamp() then
    for observation in select value from jsonb_array_elements(source->'observations') loop
     if observation->>'fingerprint'=p_source->>'fingerprint' and observation->>'timestampKind'<>'unknown' and (observation->>'sourceTimestamp')::timestamptz<=clock_timestamp() and (observation->>'expiresAt')::timestamptz>clock_timestamp() then
      facts:=jsonb_build_object('runId',run.id,'topic',observation->>'topic','source',source,'observation',observation,'expiresAt',least((observation->>'expiresAt')::timestamptz,(run.snapshot->>'observedAt')::timestamptz+make_interval(secs=>(source->>'ttlSeconds')::integer)));
     end if;
    end loop;
   end if;
  end loop;
 else raise exception 'CONTENT_INVALID' using errcode='22023';
 end case;
 if facts is null then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
 return facts;
end $$;
create function public.read_content_evidence(p_org uuid,p_sources jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare source jsonb; result jsonb:='[]';
begin
 if p_sources is null or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources)>50 then raise exception 'CONTENT_INVALID' using errcode='22023'; end if;
 for source in select value from jsonb_array_elements(p_sources) order by value->>'kind',value->>'id' loop result:=result||jsonb_build_array((source-'snapshot')||jsonb_build_object('snapshot',public.internal_content_evidence(p_org,source))); end loop;
 return result;
end $$;
create function public.internal_check_content(p_org uuid,p_document jsonb) returns void language plpgsql set search_path='' as $$
declare source jsonb; facts jsonb; settings jsonb;
begin
 if p_document is null or jsonb_typeof(p_document)<>'object' or not p_document ?& array['schema','draft','evidence','templates','fields','validation','artifactHash','contentHash'] or p_document->>'schema'<>'onevoice.content.v1' or p_document->'artifactHash'<>'null'::jsonb or p_document->'validation' is distinct from '{"status":"VALID","validator":"ov032-v1"}'::jsonb or jsonb_typeof(p_document->'evidence')<>'array' or jsonb_array_length(p_document->'evidence')>50 or octet_length(p_document::text)>750000 then raise exception 'CONTENT_INVALID' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements(p_document->'evidence') e where e->>'kind'='brand' and (e->>'id')::uuid=p_org) then raise exception 'CONTENT_SETTINGS_REQUIRED' using errcode='22023'; end if;
 for source in select value from jsonb_array_elements(p_document->'evidence') order by value->>'kind',value->>'id' loop
  facts:=public.internal_content_evidence(p_org,source);
  if facts is distinct from source->'snapshot' then raise exception 'CONTENT_SOURCE_STALE' using errcode='40001'; end if;
  if source->>'kind'='brand' then settings:=facts->'settings'; end if;
 end loop;
 if public.internal_campaign_forbidden((select string_agg(value,' ') from jsonb_each_text(p_document->'fields')),settings) then raise exception 'CONTENT_FORBIDDEN_TOPIC' using errcode='22023'; end if;
 for source in select value from jsonb_array_elements(p_document->'evidence') where value->>'kind'='trend' loop
  if not exists(select 1 from jsonb_array_elements_text(settings->'allowedTopics') topic where strpos(lower(normalize(source->'snapshot'->>'topic',NFKC)),lower(normalize(topic.value,NFKC)))>0) then raise exception 'CONTENT_FORBIDDEN_TOPIC' using errcode='22023'; end if;
 end loop;
end $$;
create function public.save_content_version(p_org uuid,p_slot uuid,p_id uuid,p_request uuid,p_expected integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
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
 if slot.content_revision<>p_expected or slot.status not in('PLANNED','READY') or campaign.status not in('PLANNED','ACTIVE') then raise exception 'CONTENT_CONFLICT' using errcode='40001'; end if;
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
 -- Recheck wall-clock freshness after all locks/audit work, before committing.
 perform public.internal_check_content(p_org,p_document);
 return jsonb_build_object('id',p_id,'version',p_expected+1,'contentHash',p_document->>'contentHash');
end $$;
create function public.check_content_version(p_org uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare content public.content_versions; slot public.campaign_slots; campaign public.campaigns;
begin
 select * into content from public.content_versions where id=p_id and organization_id=p_org;
 if not found then raise exception 'CONTENT_FORBIDDEN' using errcode='42501'; end if;
 select c.* into campaign from public.campaigns c join public.campaign_slots s on s.campaign_id=c.id where s.id=content.slot_id for share of c;
 select * into slot from public.campaign_slots where id=content.slot_id for share;
 if slot.content_version_id is distinct from content.id or campaign.status not in('PLANNED','ACTIVE') or slot.status not in('PLANNED','READY') then raise exception 'CONTENT_CONFLICT' using errcode='40001'; end if;
 perform public.internal_check_content(p_org,content.document);
 return jsonb_build_object('id',content.id,'contentHash',content.content_hash,'checkedAt',clock_timestamp(),'artifactHash',null);
end $$;
revoke all on function public.internal_content_evidence(uuid,jsonb),public.internal_check_content(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_content_evidence(uuid,jsonb),public.save_content_version(uuid,uuid,uuid,uuid,integer,jsonb),public.check_content_version(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_content_evidence(uuid,jsonb),public.save_content_version(uuid,uuid,uuid,uuid,integer,jsonb),public.check_content_version(uuid,uuid) to service_role;
