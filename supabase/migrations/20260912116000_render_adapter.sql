-- SPDX-License-Identifier: Apache-2.0
-- OV-046: contentVersionId → stable renderId mapping and immutable render receipts.
-- artifact_hash lives on the receipt only; content_versions stay immutable.

alter table public.business_jobs drop constraint business_jobs_kind_check;
alter table public.business_jobs add constraint business_jobs_kind_check check(kind in('inbound_event','outbound_message','automation_tick','knowledge_ingest','render_content'));

create table public.render_jobs (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 content_version_id uuid not null unique references public.content_versions(id),
 slot_id uuid not null references public.campaign_slots(id),
 content_revision integer not null check(content_revision>0),
 job_id uuid unique references public.business_jobs(id),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 template_hash text not null check(template_hash ~ '^[a-f0-9]{64}$'),
 media_hash text not null check(media_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 check(id=content_version_id)
);
create trigger render_jobs_immutable before update or delete on public.render_jobs for each row execute function public.reject_audit_mutation();
create trigger render_jobs_no_truncate before truncate on public.render_jobs for each statement execute function public.reject_audit_mutation();

create table public.render_receipts (
 id uuid primary key references public.render_jobs(id),
 organization_id uuid not null references public.organizations(id),
 content_version_id uuid not null references public.content_versions(id),
 slot_id uuid not null references public.campaign_slots(id),
 content_revision integer not null check(content_revision>0),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 template_hash text not null check(template_hash ~ '^[a-f0-9]{64}$'),
 media_hash text not null check(media_hash ~ '^[a-f0-9]{64}$'),
 artifact_hash text check(artifact_hash is null or artifact_hash ~ '^[a-f0-9]{64}$'),
 manifest_path text check(manifest_path is null or (char_length(manifest_path) between 1 and 300 and manifest_path ~ '^[0-9a-f-]{36}/manifest\.json$')),
 status text not null check(status in('succeeded','failed','not_publishable')),
 completed_at timestamptz not null default clock_timestamp(),
 check((status='succeeded' and artifact_hash is not null and manifest_path is not null) or (status in('failed','not_publishable')))
);
create trigger render_receipts_immutable before update or delete on public.render_receipts for each row execute function public.reject_audit_mutation();
create trigger render_receipts_no_truncate before truncate on public.render_receipts for each statement execute function public.reject_audit_mutation();

alter table public.render_jobs enable row level security;
alter table public.render_receipts enable row level security;
revoke all on public.render_jobs,public.render_receipts from public,anon,authenticated,service_role;
grant select on public.render_jobs,public.render_receipts to service_role;
create policy render_jobs_read on public.render_jobs for select to service_role using(true);
create policy render_receipts_read on public.render_receipts for select to service_role using(true);

create function public.internal_render_hashes(p_document jsonb) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'templateHash', encode(sha256(convert_to(coalesce((select jsonb_agg(t->>'templateHash' order by t->>'templateHash') from jsonb_array_elements(coalesce(p_document->'templates','[]'::jsonb)) t),'[]'::jsonb)::text,'utf8')),'hex'),
  'mediaHash', encode(sha256(convert_to(coalesce((
   select jsonb_agg(scene->'inputs'->>inp.key order by scene->'inputs'->>inp.key)
   from jsonb_array_elements(coalesce(p_document->'draft'->'script'->'scenes','[]'::jsonb)) scene
   join jsonb_array_elements(coalesce(p_document->'templates','[]'::jsonb)) tmpl on tmpl->>'templateId'=scene->>'templateId'
   join jsonb_each_text(coalesce(tmpl->'nonTextInputs','{}'::jsonb)) inp on inp.value='mediaUrl'
   where jsonb_typeof(scene->'inputs'->inp.key)='string'
  ),'[]'::jsonb)::text,'utf8')),'hex')
 );
$$;

create function public.internal_render_record(p_receipt public.render_receipts) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'renderId',p_receipt.id,'contentVersionId',p_receipt.content_version_id,'slotId',p_receipt.slot_id,'contentRevision',p_receipt.content_revision,
  'contentHash',p_receipt.content_hash,'templateHash',p_receipt.template_hash,'mediaHash',p_receipt.media_hash,
  'artifactHash',p_receipt.artifact_hash,'manifestPath',p_receipt.manifest_path,'status',p_receipt.status,
  'publishable',exists(
   select 1 from public.campaign_slots s
   where s.id=p_receipt.slot_id and s.content_version_id=p_receipt.content_version_id
    and p_receipt.status='succeeded' and p_receipt.artifact_hash is not null
  )
 );
$$;

create function public.enqueue_render(p_org uuid,p_content_version_id uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare content public.content_versions; mapping public.render_jobs; hashes jsonb; job uuid;
begin
 if p_org is null or p_content_version_id is null then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_content_version_id::text,460));
 select * into mapping from public.render_jobs where content_version_id=p_content_version_id;
 if found then
  if mapping.organization_id is distinct from p_org then raise exception 'RENDER_FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object('renderId',mapping.id,'contentVersionId',mapping.content_version_id);
 end if;
 select * into content from public.content_versions where id=p_content_version_id and organization_id=p_org;
 if not found then raise exception 'RENDER_FORBIDDEN' using errcode='42501'; end if;
 hashes:=public.internal_render_hashes(content.document);
 job:=public.enqueue_business_job(p_org,'render_content',content.id,content.id,clock_timestamp(),3);
 insert into public.render_jobs(id,organization_id,content_version_id,slot_id,content_revision,job_id,content_hash,template_hash,media_hash)
 values(content.id,p_org,content.id,content.slot_id,content.version,job,content.content_hash,hashes->>'templateHash',hashes->>'mediaHash')
 on conflict(content_version_id) do nothing;
 select * into mapping from public.render_jobs where content_version_id=content.id;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_org,'system','render.enqueued','content_version',content.id,'render.mapped',content.id,content.id)
 on conflict(idempotency_key) do nothing;
 return jsonb_build_object('renderId',mapping.id,'contentVersionId',mapping.content_version_id);
end $$;

create function public.claim_render_job(p_owner uuid) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; t timestamptz:=clock_timestamp();
begin
 if p_owner is null then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 for j in select * from public.business_jobs where kind='render_content' and ((status='queued' and available_at<=t) or (status='running' and lease_expires_at<=t)) order by available_at,id for update skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=t+interval '60 seconds',attempt_started_at=t,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *; return;
  end if;
 end loop;
end $$;

create function public.load_render_job(p_job_id uuid,p_owner uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare j public.business_jobs; mapping public.render_jobs; content public.content_versions; campaign public.campaigns; product uuid;
begin
 if p_job_id is null or p_owner is null or p_token is null then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 select * into j from public.business_jobs where id=p_job_id and kind='render_content' and status='running' and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp();
 if not found then return null; end if;
 select * into mapping from public.render_jobs where job_id=j.id and organization_id=j.organization_id;
 if not found then return null; end if;
 select * into content from public.content_versions where id=mapping.content_version_id and organization_id=j.organization_id;
 if not found then return null; end if;
 select c.* into campaign from public.campaigns c join public.campaign_slots s on s.campaign_id=c.id where s.id=mapping.slot_id;
 if campaign.source_kind='product' then product:=campaign.source_ref::uuid;
 else select (e->>'id')::uuid into product from jsonb_array_elements(content.document->'evidence') e where e->>'kind'='product' order by e->>'id' limit 1;
 end if;
 if product is null then return null; end if;
 return jsonb_build_object(
  'renderId',mapping.id,'organizationId',mapping.organization_id,'contentVersionId',mapping.content_version_id,'slotId',mapping.slot_id,
  'contentRevision',mapping.content_revision,'contentHash',mapping.content_hash,'templateHash',mapping.template_hash,'mediaHash',mapping.media_hash,
  'productId',product,'script',content.document->'draft'->'script','content',jsonb_build_object('hook',content.document#>>'{draft,post,hook}','caption',content.document#>>'{draft,post,caption}','cta',content.document#>>'{draft,post,cta}','model',coalesce(content.document#>>'{draft,model,id}','persisted'))
 );
end $$;

create function public.finish_render(p_job_id uuid,p_owner uuid,p_token uuid,p_outcome jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare j public.business_jobs; mapping public.render_jobs; receipt public.render_receipts; v_status text; v_artifact text; v_manifest text;
begin
 if p_job_id is null or p_owner is null or p_token is null or jsonb_typeof(p_outcome) is distinct from 'object' then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 select * into mapping from public.render_jobs where job_id=p_job_id;
 if found then
  select * into receipt from public.render_receipts where id=mapping.id;
  if found then return public.internal_render_record(receipt); end if;
 end if;
 select * into j from public.business_jobs where id=p_job_id and kind='render_content' and status='running' and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp() for update;
 if not found then return null; end if;
 select * into mapping from public.render_jobs where job_id=j.id and organization_id=j.organization_id;
 if not found then return null; end if;
 select * into receipt from public.render_receipts where id=mapping.id;
 if found then return public.internal_render_record(receipt); end if;
 v_status:=p_outcome->>'status';
 v_artifact:=nullif(p_outcome->>'artifactHash','');
 v_manifest:=nullif(p_outcome->>'manifestPath','');
 if v_status not in('succeeded','failed','not_publishable') then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 if v_status='succeeded' and (v_artifact is null or v_artifact !~ '^[a-f0-9]{64}$' or v_manifest is null or v_manifest!~'^[0-9a-f-]{36}/manifest\.json$') then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 if v_status<>'succeeded' then v_artifact:=null; v_manifest:=null; end if;
 insert into public.render_receipts(id,organization_id,content_version_id,slot_id,content_revision,content_hash,template_hash,media_hash,artifact_hash,manifest_path,status)
 values(mapping.id,mapping.organization_id,mapping.content_version_id,mapping.slot_id,mapping.content_revision,mapping.content_hash,mapping.template_hash,mapping.media_hash,v_artifact,v_manifest,v_status)
 on conflict(id) do nothing returning * into receipt;
 if receipt.id is null then select * into receipt from public.render_receipts where id=mapping.id; end if;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(mapping.organization_id,'system','render.completed','render_receipt',mapping.id,'render.'||receipt.status,mapping.content_version_id,mapping.id)
 on conflict(idempotency_key) do nothing;
 return public.internal_render_record(receipt);
end $$;

create function public.read_render_receipt(p_org uuid,p_render_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.render_receipts;
begin
 if p_org is null or p_render_id is null then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 select * into receipt from public.render_receipts where id=p_render_id and organization_id=p_org;
 if not found then return null; end if;
 return public.internal_render_record(receipt);
end $$;

create function public.latest_publishable_render(p_org uuid,p_slot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.render_receipts; slot public.campaign_slots;
begin
 if p_org is null or p_slot is null then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 select s.* into slot from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id where s.id=p_slot and c.organization_id=p_org;
 if not found or slot.content_version_id is null then return null; end if;
 select * into receipt from public.render_receipts where content_version_id=slot.content_version_id and organization_id=p_org and status='succeeded' and artifact_hash is not null;
 if not found then return null; end if;
 return public.internal_render_record(receipt);
end $$;

create function public.list_stale_renders(p_org uuid,p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_org is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'RENDER_INVALID' using errcode='22023'; end if;
 return coalesce((
  select jsonb_agg(r.id order by r.completed_at,r.id)
  from (select rec.id,rec.completed_at from public.render_receipts rec join public.campaign_slots s on s.id=rec.slot_id
   where rec.organization_id=p_org and s.content_version_id is distinct from rec.content_version_id
   order by rec.completed_at,rec.id limit p_limit) r
 ),'[]'::jsonb);
end $$;

create or replace function public.claim_business_job(p_owner uuid,p_lease_seconds integer default 60,p_now timestamptz default clock_timestamp()) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select b.* from public.business_jobs b
  where b.kind not in('knowledge_ingest','render_content','outbound_message')
   and not (b.kind='inbound_event' and exists(select 1 from public.facebook_inbound_events e where e.id=b.entity_id and e.organization_id=b.organization_id and e.kind in('message','postback','referral')))
   and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now))
  order by b.available_at,b.id for update of b skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *; return;
  end if;
 end loop;
end $$;

revoke all on function public.internal_render_hashes(jsonb),public.internal_render_record(public.render_receipts) from public,anon,authenticated,service_role;
revoke all on function public.enqueue_render(uuid,uuid),public.claim_render_job(uuid),public.load_render_job(uuid,uuid,uuid),public.finish_render(uuid,uuid,uuid,jsonb),public.read_render_receipt(uuid,uuid),public.latest_publishable_render(uuid,uuid),public.list_stale_renders(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.enqueue_render(uuid,uuid),public.claim_render_job(uuid),public.load_render_job(uuid,uuid,uuid),public.finish_render(uuid,uuid,uuid,jsonb),public.read_render_receipt(uuid,uuid),public.latest_publishable_render(uuid,uuid),public.list_stale_renders(uuid,integer) to service_role;
