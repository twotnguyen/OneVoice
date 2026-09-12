-- SPDX-License-Identifier: Apache-2.0
-- Existing imported promotions remain the only promotion truth.
alter table public.promotions add column version integer not null default 1 check(version>0),
 add column disabled_at timestamptz, add column details_text text, add column manually_edited_at timestamptz,
 add column scope text not null default 'products' check(scope in ('all','products'));
create table public.business_policies (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in ('return','warranty','service')),
 title text not null, body text not null, starts_at timestamptz, expires_at timestamptz,
 disabled_at timestamptz, product_ids uuid[] not null default '{}', version integer not null check(version>0),
 updated_at timestamptz not null default clock_timestamp(), check(starts_at is null or expires_at is null or starts_at<expires_at)
);
create index business_policies_scope_idx on public.business_policies(organization_id,updated_at desc,id);
create table public.knowledge_edits (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id), actor_id uuid not null,
 entity_id uuid not null, entity_kind text not null, expected_version integer not null, version integer not null,
 document jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.business_policies enable row level security;
alter table public.knowledge_edits enable row level security;
revoke all on public.business_policies,public.knowledge_edits from public,anon,authenticated,service_role;
grant select on public.business_policies,public.knowledge_edits to service_role;
create policy server_reads_business_policies on public.business_policies for select to service_role using(true);
create policy server_reads_knowledge_edits on public.knowledge_edits for select to service_role using(true);
create trigger knowledge_edits_immutable before update or delete on public.knowledge_edits for each row execute function public.reject_audit_mutation();
create trigger knowledge_edits_no_truncate before truncate on public.knowledge_edits for each statement execute function public.reject_audit_mutation();

create function public.save_knowledge(p_organization_id uuid,p_actor_id uuid,p_id uuid,p_request_id uuid,p_expected_version integer,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.knowledge_edits; old_version integer; old_org uuid; old_kind text; target_kind text;
 ids uuid[]; item jsonb; start_time timestamptz; end_time timestamptz; changed timestamptz:=clock_timestamp();
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'KNOWLEDGE_FORBIDDEN' using errcode='42501'; end if;
 if p_id is null or p_request_id is null or p_expected_version is null or p_expected_version not between 0 and 2147483646 or p_document is null or jsonb_typeof(p_document)<>'object' then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p_document))<>10 or not p_document ?& array['kind','title','body','startsAt','expiresAt','active','scope','productIds','discountType','discountValue'] then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 target_kind:=p_document->>'kind';
 if target_kind is null or target_kind not in ('return','warranty','service','promotion') or jsonb_typeof(p_document->'active')<>'boolean' or jsonb_typeof(p_document->'title')<>'string' or jsonb_typeof(p_document->'body')<>'string' or length(btrim(p_document->>'title')) not between 1 and 200 or length(btrim(p_document->>'body')) not between 1 and 10000 then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 if ((p_document->>'title')||(p_document->>'body')) ~* '</?[[:alpha:]][^>]*>' or translate((p_document->>'title')||(p_document->>'body'),E'\n\r\t','') ~ '[[:cntrl:]]' then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 foreach item in array array[p_document->'startsAt',p_document->'expiresAt'] loop
  if jsonb_typeof(item) not in ('null','string') or (jsonb_typeof(item)='string' and item#>>'{}' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$') then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 end loop;
 start_time:=(p_document->>'startsAt')::timestamptz; end_time:=(p_document->>'expiresAt')::timestamptz;
 if start_time is not null and end_time is not null and start_time>=end_time then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 if jsonb_typeof(p_document->'scope')<>'string' or p_document->>'scope' not in ('all','products') or jsonb_typeof(p_document->'productIds')<>'array' or jsonb_array_length(p_document->'productIds')>100 or (p_document->>'scope'='products' and jsonb_array_length(p_document->'productIds')=0) or (p_document->>'scope'='all' and jsonb_array_length(p_document->'productIds')<>0) then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 select coalesce(array_agg(v::uuid),'{}') into ids from jsonb_array_elements_text(p_document->'productIds') v;
 if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 perform 1 from public.products where id=any(ids) and organization_id=p_organization_id for share;
 if (select count(*) from public.products where id=any(ids) and organization_id=p_organization_id)<>cardinality(ids) then raise exception 'KNOWLEDGE_FORBIDDEN' using errcode='42501'; end if;
 if jsonb_typeof(p_document->'discountType') not in ('null','string') or length(p_document->>'discountType')>64 or jsonb_typeof(p_document->'discountValue') not in ('null','number') then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 if target_kind<>'promotion' and (p_document->>'discountType' is not null or p_document->>'discountValue' is not null) then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 if (p_document->>'discountValue')::numeric not between 0 and 9007199254740991 or (p_document->>'discountType'='percent' and (p_document->>'discountValue')::numeric>100) or (p_document->>'discountType'='fixed' and (p_document->>'discountValue')::numeric<>trunc((p_document->>'discountValue')::numeric)) then raise exception 'KNOWLEDGE_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,110));
 select * into prior from public.knowledge_edits where request_id=p_request_id;
 if found then
  if prior.organization_id<>p_organization_id or prior.actor_id<>p_actor_id or prior.entity_id<>p_id or prior.expected_version<>p_expected_version or prior.document is distinct from p_document then raise exception 'KNOWLEDGE_CONFLICT' using errcode='40001'; end if;
  return jsonb_build_object('id',p_id,'version',prior.version);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,111));
 if (target_kind='promotion' and exists(select 1 from public.business_policies where id=p_id)) or (target_kind<>'promotion' and exists(select 1 from public.promotions where id=p_id)) then raise exception 'KNOWLEDGE_CONFLICT' using errcode='40001'; end if;
 if target_kind='promotion' then
  select organization_id,version into old_org,old_version from public.promotions where id=p_id for update;
 else
  select organization_id,version,kind into old_org,old_version,old_kind from public.business_policies where id=p_id for update;
 end if;
 if old_org is not null and old_org<>p_organization_id then raise exception 'KNOWLEDGE_FORBIDDEN' using errcode='42501'; end if;
 if coalesce(old_version,0)<>p_expected_version or (old_kind is not null and old_kind<>target_kind) then raise exception 'KNOWLEDGE_CONFLICT' using errcode='40001'; end if;
 if target_kind='promotion' then
  insert into public.promotions(id,organization_id,label,promotion_type,details_text,starts_at,expires_at,discount_type,discount_value,disabled_at,version,manually_edited_at,scope)
  values(p_id,p_organization_id,btrim(p_document->>'title'),'manual',btrim(p_document->>'body'),start_time,end_time,p_document->>'discountType',(p_document->>'discountValue')::numeric,case when (p_document->>'active')::boolean then null else changed end,p_expected_version+1,changed,p_document->>'scope')
  on conflict(id) do update set label=excluded.label,details_text=excluded.details_text,starts_at=excluded.starts_at,expires_at=excluded.expires_at,discount_type=excluded.discount_type,discount_value=excluded.discount_value,disabled_at=excluded.disabled_at,version=excluded.version,scope=excluded.scope,manually_edited_at=changed,updated_at=changed;
  delete from public.product_promotions where promotion_id=p_id;
  insert into public.product_promotions(product_id,promotion_id) select unnest(ids),p_id;
 else
  insert into public.business_policies(id,organization_id,kind,title,body,starts_at,expires_at,disabled_at,product_ids,version)
  values(p_id,p_organization_id,target_kind,btrim(p_document->>'title'),btrim(p_document->>'body'),start_time,end_time,case when (p_document->>'active')::boolean then null else changed end,ids,p_expected_version+1)
  on conflict(id) do update set title=excluded.title,body=excluded.body,starts_at=excluded.starts_at,expires_at=excluded.expires_at,disabled_at=excluded.disabled_at,product_ids=excluded.product_ids,version=excluded.version,updated_at=changed;
 end if;
 insert into public.knowledge_edits(request_id,organization_id,actor_id,entity_id,entity_kind,expected_version,version,document) values(p_request_id,p_organization_id,p_actor_id,p_id,target_kind,p_expected_version,p_expected_version+1,p_document);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key) values(p_organization_id,'staff',p_actor_id,'knowledge.saved',case when target_kind='promotion' then 'promotion' else 'policy' end,p_id,'manager.edit',p_request_id,p_request_id);
 return jsonb_build_object('id',p_id,'version',p_expected_version+1);
end $$;
revoke all on function public.save_knowledge(uuid,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_knowledge(uuid,uuid,uuid,uuid,integer,jsonb) to service_role;

-- Keep existing view columns for catalog consumers; never add overlapping discounts.
create or replace view public.active_product_promotions with(security_invoker=true) as
select p.id as product_id,pr.id as promotion_id,pr.organization_id,pr.source_code,pr.label,pr.promotion_type,pr.discount_type,pr.discount_value,pr.starts_at,pr.expires_at,pr.is_flash_sale
from public.promotions pr join public.products p on p.organization_id=pr.organization_id and p.disabled_at is null
and (pr.scope='all' or exists(select 1 from public.product_promotions pp where pp.product_id=p.id and pp.promotion_id=pr.id))
where pr.disabled_at is null and (pr.starts_at is null or pr.starts_at<=now()) and (pr.expires_at is null or now()<pr.expires_at);
