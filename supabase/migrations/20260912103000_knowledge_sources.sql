-- SPDX-License-Identifier: Apache-2.0
create table public.knowledge_sources (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 version integer not null check(version>0),
 document jsonb not null check(jsonb_typeof(document)='object'),
 updated_at timestamptz not null default clock_timestamp()
);
create index knowledge_sources_list_idx on public.knowledge_sources(organization_id,updated_at desc,id);
create table public.knowledge_source_versions (
 source_id uuid not null references public.knowledge_sources(id),
 version integer not null,
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 request_id uuid not null unique,
 expected_version integer not null,
 document jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(source_id,version)
);
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_source_versions enable row level security;
revoke all on public.knowledge_sources,public.knowledge_source_versions from public,anon,authenticated,service_role;
grant select on public.knowledge_sources,public.knowledge_source_versions to service_role;
create trigger source_versions_immutable before update or delete on public.knowledge_source_versions for each row execute function public.reject_audit_mutation();
create trigger source_versions_no_truncate before truncate on public.knowledge_source_versions for each statement execute function public.reject_audit_mutation();

create function public.save_knowledge_source(p_organization_id uuid,p_actor_id uuid,p_id uuid,p_request_id uuid,p_expected_version integer,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.knowledge_sources; receipt public.knowledge_source_versions; new_version integer; host text;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'source_forbidden' using errcode='42501'; end if;
 if p_id is null or p_request_id is null or p_expected_version is null or p_expected_version not between 0 and 2147483646 then raise exception 'source_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,490));
 select * into receipt from public.knowledge_source_versions where request_id=p_request_id;
 if found then
  if receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.source_id<>p_id or receipt.expected_version<>p_expected_version or receipt.document is distinct from p_document then raise exception 'source_conflict' using errcode='40001'; end if;
  return jsonb_build_object('id',p_id,'version',receipt.version);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,491));
 select * into previous from public.knowledge_sources where id=p_id for update;
 if found then
  if previous.organization_id<>p_organization_id then raise exception 'source_forbidden' using errcode='42501'; end if;
  if previous.version<>p_expected_version then raise exception 'source_conflict' using errcode='40001'; end if;
  new_version:=previous.version+1;
 else
  if p_expected_version<>0 then raise exception 'source_conflict' using errcode='40001'; end if;
  new_version:=1;
 end if;
 if p_document is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>131072 then raise exception 'source_invalid' using errcode='22023'; end if;
 if not(p_document ?& array['name','kind','text','url','authority','productIds','topics','freshnessHours','active']) or (select count(*) from jsonb_object_keys(p_document))<>9 then raise exception 'source_invalid' using errcode='22023'; end if;
 if jsonb_typeof(p_document->'name')<>'string' or char_length(trim(p_document->>'name')) not between 1 and 200
  or coalesce(p_document->>'kind','') not in ('text','html') or coalesce(p_document->>'authority','') not in ('business','reference')
  or jsonb_typeof(p_document->'active')<>'boolean' or jsonb_typeof(p_document->'freshnessHours')<>'number'
  or (p_document->>'freshnessHours')!~'^[0-9]+$' then raise exception 'source_invalid' using errcode='22023'; end if;
 if (p_document->>'freshnessHours')::numeric not between 1 and 720 then raise exception 'source_invalid' using errcode='22023'; end if;
 if jsonb_typeof(p_document->'productIds')<>'array' or jsonb_typeof(p_document->'topics')<>'array' then raise exception 'source_invalid' using errcode='22023'; end if;
 if jsonb_array_length(p_document->'productIds')>100 or jsonb_array_length(p_document->'topics')>30 then raise exception 'source_invalid' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_document->'topics') t where jsonb_typeof(t)<>'string' or char_length(trim(t#>>'{}')) not between 1 and 120)
  or exists(select 1 from jsonb_array_elements(p_document->'productIds') i where jsonb_typeof(i)<>'string')
  or (select count(*)<>count(distinct value) from jsonb_array_elements_text(p_document->'productIds')) then raise exception 'source_invalid' using errcode='22023'; end if;
 -- Lock product identity/scope while saving; sources may remain attached to disabled products for history.
 perform p.id from public.products p where p.organization_id=p_organization_id and p.id in(select value::uuid from jsonb_array_elements_text(p_document->'productIds')) order by p.id for share;
 if (select count(*) from public.products p where p.organization_id=p_organization_id and p.id in(select value::uuid from jsonb_array_elements_text(p_document->'productIds')))<>jsonb_array_length(p_document->'productIds') then raise exception 'source_invalid' using errcode='22023'; end if;
 if p_document->>'kind'='text' then
  if jsonb_typeof(p_document->'text')<>'string' or char_length(trim(p_document->>'text')) not between 1 and 20000 or p_document->'url'<>'null'::jsonb then raise exception 'source_invalid' using errcode='22023'; end if;
 else
  if jsonb_typeof(p_document->'url')<>'string' or p_document->'text'<>'null'::jsonb or char_length(p_document->>'url')>2048
   or p_document->>'url' !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+[A-Za-z0-9](:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then raise exception 'source_invalid' using errcode='22023'; end if;
  host:=lower(split_part(substring(p_document->>'url' from 9),'/',1)); host:=split_part(split_part(split_part(host,':',1),'?',1),'#',1);
  if position('.' in host)=0 or host~'^[0-9.]+$' or host~'(^|\.)(localhost|local|localdomain|internal|lan|home)$' then raise exception 'source_invalid' using errcode='22023'; end if;
 end if;
 insert into public.knowledge_sources(id,organization_id,version,document) values(p_id,p_organization_id,new_version,p_document)
 on conflict(id) do update set version=excluded.version,document=excluded.document,updated_at=clock_timestamp();
 insert into public.knowledge_source_versions(source_id,version,organization_id,actor_id,request_id,expected_version,document)
 values(p_id,new_version,p_organization_id,p_actor_id,p_request_id,p_expected_version,p_document);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'knowledge.source_saved','knowledge_source',p_id,'manager_update',p_request_id,p_request_id);
 return jsonb_build_object('id',p_id,'version',new_version);
end $$;
revoke all on function public.save_knowledge_source(uuid,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_knowledge_source(uuid,uuid,uuid,uuid,integer,jsonb) to service_role;
