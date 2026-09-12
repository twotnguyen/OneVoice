-- SPDX-License-Identifier: Apache-2.0
alter table public.business_jobs drop constraint business_jobs_kind_check;
alter table public.business_jobs add constraint business_jobs_kind_check check(kind in('inbound_event','outbound_message','automation_tick','knowledge_ingest'));
-- Dedicated ingestion pump owns this kind; the generic pump cannot deadletter it
-- as unsupported while serving unrelated handlers.
create or replace function public.claim_business_job(p_owner uuid,p_lease_seconds integer default 60,p_now timestamptz default clock_timestamp())
returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 for j in select * from public.business_jobs where kind<>'knowledge_ingest' and ((status='queued' and available_at<=p_now) or (status='running' and lease_expires_at<=p_now)) order by available_at,id for update skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *; return;
  end if;
 end loop;
end $$;
create table public.knowledge_ingestion_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), source_id uuid not null references public.knowledge_sources(id),
 source_version integer not null, refresh_cycle bigint not null, job_id uuid unique references public.business_jobs(id),
 last_error text check(last_error in('unsafe_url','unsafe_address','dns_unavailable','timeout','aborted','too_large','redirect_rejected','http_error','unsupported_encoding','network_error','unsupported_content','empty_content','inactive','ingestion_failed')),
 created_at timestamptz not null default clock_timestamp(), unique(source_id,source_version,refresh_cycle)
);
create table public.knowledge_ingestions (
 id uuid primary key references public.knowledge_ingestion_runs(id), organization_id uuid not null references public.organizations(id), source_id uuid not null references public.knowledge_sources(id), source_version integer not null,
 source_document jsonb not null, content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'), final_url text, content_type text not null check(content_type in('text/plain','text/html')),
 fetched_at timestamptz not null, expires_at timestamptz not null check(expires_at>fetched_at), published_at timestamptz not null default clock_timestamp()
);
create table public.knowledge_chunks (
 ingestion_id uuid not null references public.knowledge_ingestions(id), ordinal integer not null check(ordinal between 1 and 100), body text not null check(length(body) between 1 and 2000),
 primary key(ingestion_id,ordinal)
);
create index knowledge_runs_latest on public.knowledge_ingestion_runs(source_id,source_version,refresh_cycle desc);
create trigger knowledge_ingestions_immutable before update or delete on public.knowledge_ingestions for each row execute function public.reject_audit_mutation();
create trigger knowledge_ingestions_no_truncate before truncate on public.knowledge_ingestions for each statement execute function public.reject_audit_mutation();
create trigger knowledge_chunks_immutable before update or delete on public.knowledge_chunks for each row execute function public.reject_audit_mutation();
create trigger knowledge_chunks_no_truncate before truncate on public.knowledge_chunks for each statement execute function public.reject_audit_mutation();
alter table public.knowledge_ingestion_runs enable row level security;
alter table public.knowledge_ingestions enable row level security;
alter table public.knowledge_chunks enable row level security;
revoke all on public.knowledge_ingestion_runs,public.knowledge_ingestions,public.knowledge_chunks from public,anon,authenticated,service_role;
grant select on public.knowledge_ingestion_runs,public.knowledge_ingestions,public.knowledge_chunks to service_role;
create policy ingestion_runs_server on public.knowledge_ingestion_runs for select to service_role using(true);
create policy ingestions_server on public.knowledge_ingestions for select to service_role using(true);
create policy chunks_server on public.knowledge_chunks for select to service_role using(true);

create function public.internal_enqueue_knowledge(p_source_id uuid,p_version integer,p_actor_id uuid default null) returns uuid language plpgsql set search_path='' as $$
declare s public.knowledge_sources; r public.knowledge_ingestion_runs; cycle bigint:=floor(extract(epoch from clock_timestamp())/900); j uuid;
begin
 select * into s from public.knowledge_sources where id=p_source_id for update;
 if not found or s.version<>p_version or not (s.document->>'active')::boolean then raise exception 'INGESTION_CONFLICT' using errcode='40001'; end if;
 insert into public.knowledge_ingestion_runs(organization_id,source_id,source_version,refresh_cycle) values(s.organization_id,s.id,s.version,cycle)
 on conflict(source_id,source_version,refresh_cycle) do nothing returning * into r;
 if r.id is null then select * into r from public.knowledge_ingestion_runs where source_id=s.id and source_version=s.version and refresh_cycle=cycle; return r.id; end if;
 j:=public.enqueue_business_job(s.organization_id,'knowledge_ingest',r.id,r.id,r.created_at,3);
 update public.knowledge_ingestion_runs set job_id=j where id=r.id;
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(s.organization_id,case when p_actor_id is null then 'system' else 'staff' end,p_actor_id,'knowledge.ingestion_requested','knowledge_source',s.id,'source.refresh',r.id,r.id);
 return r.id;
end $$;
create function public.request_knowledge_ingestion(p_organization_id uuid,p_actor_id uuid,p_source_id uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'INGESTION_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.knowledge_sources where id=p_source_id and organization_id=p_organization_id;
 if not found then raise exception 'INGESTION_FORBIDDEN' using errcode='42501'; end if;
 return public.internal_enqueue_knowledge(p_source_id,p_version,p_actor_id);
end $$;
-- Bounded scheduler called only by the explicitly launched ingestion worker.
create function public.enqueue_due_knowledge() returns integer language plpgsql security definer set search_path='' as $$
declare s public.knowledge_sources; n integer:=0; cycle bigint:=floor(extract(epoch from clock_timestamp())/900);
begin
 for s in select * from public.knowledge_sources ks where (ks.document->>'active')::boolean
 and not exists(select 1 from public.knowledge_ingestion_runs r where r.source_id=ks.id and r.source_version=ks.version and (r.refresh_cycle=cycle or exists(select 1 from public.business_jobs j where j.id=r.job_id and j.status in('queued','running'))))
 and not exists(select 1 from public.knowledge_ingestions i join public.knowledge_ingestion_runs ir on ir.id=i.id where i.source_id=ks.id and i.source_version=ks.version and i.expires_at>clock_timestamp() and ir.last_error is null and not exists(select 1 from public.knowledge_ingestion_runs newer where newer.source_id=ks.id and newer.source_version=ks.version and newer.refresh_cycle>ir.refresh_cycle))
 order by ks.updated_at,ks.id limit 20 for update skip locked
 loop perform public.internal_enqueue_knowledge(s.id,s.version); n:=n+1; end loop;
 return n;
end $$;
create function public.claim_knowledge_ingestion(p_owner uuid) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; t timestamptz:=clock_timestamp();
begin
 if p_owner is null then raise exception 'INGESTION_INVALID' using errcode='22023'; end if;
 for j in select * from public.business_jobs where kind='knowledge_ingest' and ((status='queued' and available_at<=t) or (status='running' and lease_expires_at<=t)) order by available_at,id for update skip locked
 loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=t+interval '60 seconds',attempt_started_at=t where id=j.id returning *; return;
  end if;
 end loop;
end $$;
create function public.publish_knowledge_ingestion(p_job_id uuid,p_owner uuid,p_token uuid,p_hash text,p_chunks jsonb,p_final_url text,p_content_type text)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='8s' as $$
declare j public.business_jobs; r public.knowledge_ingestion_runs; s public.knowledge_sources; chunk jsonb; n integer:=0;
begin
 select * into j from public.business_jobs where id=p_job_id and kind='knowledge_ingest' and status='running' and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp() for update;
 if not found then return false; end if;
 select * into r from public.knowledge_ingestion_runs where id=j.entity_id and job_id=j.id and organization_id=j.organization_id;
 if not found then return false; end if;
 select * into s from public.knowledge_sources where id=r.source_id and organization_id=r.organization_id for share;
 if not found or j.lease_expires_at<=clock_timestamp() or s.version<>r.source_version or not (s.document->>'active')::boolean or exists(select 1 from public.knowledge_ingestion_runs where source_id=s.id and source_version=s.version and refresh_cycle>r.refresh_cycle) then return false; end if;
 if exists(select 1 from public.knowledge_ingestions where id=r.id) then update public.knowledge_ingestion_runs set last_error=null where id=r.id; return true; end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_chunks is null or jsonb_typeof(p_chunks)<>'array' or jsonb_array_length(p_chunks) not between 1 and 100 or p_content_type is null or p_content_type not in('text/plain','text/html') or (p_final_url is not null and (length(p_final_url)>2048 or p_final_url !~ '^https://')) then raise exception 'INGESTION_INVALID' using errcode='22023'; end if;
 for chunk in select value from jsonb_array_elements(p_chunks) loop if jsonb_typeof(chunk)<>'string' or length(chunk#>>'{}') not between 1 and 2000 then raise exception 'INGESTION_INVALID' using errcode='22023'; end if; end loop;
 insert into public.knowledge_ingestions(id,organization_id,source_id,source_version,source_document,content_hash,final_url,content_type,fetched_at,expires_at)
 values(r.id,s.organization_id,s.id,s.version,s.document,p_hash,p_final_url,p_content_type,j.attempt_started_at,j.attempt_started_at+make_interval(hours=>(s.document->>'freshnessHours')::integer));
 for chunk in select value from jsonb_array_elements(p_chunks) loop n:=n+1; insert into public.knowledge_chunks(ingestion_id,ordinal,body) values(r.id,n,chunk#>>'{}'); end loop;
 update public.knowledge_ingestion_runs set last_error=null where id=r.id;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(s.organization_id,'system','knowledge.ingestion_published','knowledge_ingestion',r.id,'source.publish',j.id,gen_random_uuid());
 if j.lease_expires_at<=clock_timestamp() then raise exception 'INGESTION_LEASE_EXPIRED' using errcode='40001'; end if;
 return true;
end $$;
create function public.fail_knowledge_ingestion(p_job_id uuid,p_owner uuid,p_token uuid,p_error text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_error is null or p_error not in('unsafe_url','unsafe_address','dns_unavailable','timeout','aborted','too_large','redirect_rejected','http_error','unsupported_encoding','network_error','unsupported_content','empty_content','inactive','ingestion_failed') then p_error:='ingestion_failed'; end if;
 perform 1 from public.business_jobs where id=p_job_id and kind='knowledge_ingest' and status='running' and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp() for update;
 if not found then return false; end if;
 update public.knowledge_ingestion_runs set last_error=p_error where job_id=p_job_id; return found;
end $$;
-- Bounded unranked evidence port; callers verify conversation scope. Never system instructions.
create function public.read_current_knowledge(p_organization_id uuid,p_source_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sourceId',s.id,'sourceVersion',s.version,'name',s.document->>'name','authority',s.document->>'authority','productIds',s.document->'productIds','topics',s.document->'topics','hash',i.content_hash,'finalUrl',i.final_url,'fetchedAt',i.fetched_at,'expiresAt',i.expires_at,'chunks',(select jsonb_agg(c.body order by c.ordinal) from public.knowledge_chunks c where c.ingestion_id=i.id))
 from public.knowledge_sources s join public.knowledge_ingestions i on i.source_id=s.id and i.source_version=s.version
 join public.knowledge_ingestion_runs r on r.id=i.id where s.id=p_source_id and s.organization_id=p_organization_id and (s.document->>'active')::boolean and r.last_error is null and i.fetched_at<=clock_timestamp() and i.expires_at>clock_timestamp()
 and not exists(select 1 from public.knowledge_ingestion_runs newer where newer.source_id=s.id and newer.source_version=s.version and newer.refresh_cycle>r.refresh_cycle)
 order by r.refresh_cycle desc limit 1
$$;
create function public.knowledge_ingestion_status(p_organization_id uuid,p_actor_id uuid,p_source_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.knowledge_sources; r public.knowledge_ingestion_runs; j public.business_jobs; i public.knowledge_ingestions;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'INGESTION_FORBIDDEN' using errcode='42501'; end if;
 select * into s from public.knowledge_sources where id=p_source_id and organization_id=p_organization_id;
 if not found then return null; end if;
 select * into r from public.knowledge_ingestion_runs where source_id=s.id and source_version=s.version order by refresh_cycle desc limit 1;
 select * into j from public.business_jobs where id=r.job_id;
 select * into i from public.knowledge_ingestions where id=r.id;
 return jsonb_build_object('sourceVersion',s.version,'status',case when not (s.document->>'active')::boolean then 'disabled' when r.id is null then 'not_loaded' when r.last_error is not null then case when j.status='dead' then 'failed' else 'retrying' end when i.id is not null then case when i.expires_at>clock_timestamp() then 'ready' else 'stale' end else coalesce(j.status,'not_loaded') end,'error',r.last_error,'attempts',coalesce(j.attempts,0),'fetchedAt',i.fetched_at,'expiresAt',i.expires_at);
end $$;
revoke all on function public.internal_enqueue_knowledge(uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.request_knowledge_ingestion(uuid,uuid,uuid,integer),public.enqueue_due_knowledge(),public.claim_knowledge_ingestion(uuid),public.publish_knowledge_ingestion(uuid,uuid,uuid,text,jsonb,text,text),public.fail_knowledge_ingestion(uuid,uuid,uuid,text),public.read_current_knowledge(uuid,uuid),public.knowledge_ingestion_status(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_knowledge_ingestion(uuid,uuid,uuid,integer),public.enqueue_due_knowledge(),public.claim_knowledge_ingestion(uuid),public.publish_knowledge_ingestion(uuid,uuid,uuid,text,jsonb,text,text),public.fail_knowledge_ingestion(uuid,uuid,uuid,text),public.read_current_knowledge(uuid,uuid),public.knowledge_ingestion_status(uuid,uuid,uuid) to service_role;
