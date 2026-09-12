-- SPDX-License-Identifier: Apache-2.0
create table public.knowledge_gaps (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 product_id uuid references public.products(id), field text not null check(field in('price','availability','specification','compatibility','policy','service','program','delivery','warranty')),
 reason text not null check(reason in('missing_evidence','lookup_failed')), status text not null check(status in('OPEN','RESOLVED')),
 version integer not null check(version>0), occurrences integer not null check(occurrences>0),
 last_conversation_id uuid not null references public.conversations(id), updated_at timestamptz not null default clock_timestamp(), resolved_at timestamptz,
 unique nulls not distinct(organization_id,product_id,field,reason)
);
create index knowledge_gap_queue on public.knowledge_gaps(organization_id,status,updated_at desc,id);
create table public.knowledge_gap_occurrences (
 gap_id uuid not null references public.knowledge_gaps(id), source_event_id uuid not null references public.facebook_inbound_events(id),
 organization_id uuid not null references public.organizations(id), conversation_id uuid not null references public.conversations(id),
 created_at timestamptz not null default clock_timestamp(), primary key(gap_id,source_event_id)
);
create table public.knowledge_gap_resolutions (
 request_id uuid primary key, gap_id uuid not null references public.knowledge_gaps(id), organization_id uuid not null references public.organizations(id),
 actor_id uuid not null, expected_version integer not null,version integer not null,created_at timestamptz not null default clock_timestamp()
);
create trigger gap_occurrences_immutable before update or delete on public.knowledge_gap_occurrences for each row execute function public.reject_audit_mutation();
create trigger gap_occurrences_no_truncate before truncate on public.knowledge_gap_occurrences for each statement execute function public.reject_audit_mutation();
create trigger gap_resolutions_immutable before update or delete on public.knowledge_gap_resolutions for each row execute function public.reject_audit_mutation();
create trigger gap_resolutions_no_truncate before truncate on public.knowledge_gap_resolutions for each statement execute function public.reject_audit_mutation();
alter table public.knowledge_gaps enable row level security;
alter table public.knowledge_gap_occurrences enable row level security;
alter table public.knowledge_gap_resolutions enable row level security;
revoke all on public.knowledge_gaps,public.knowledge_gap_occurrences,public.knowledge_gap_resolutions from public,anon,authenticated,service_role;
grant select on public.knowledge_gaps,public.knowledge_gap_occurrences,public.knowledge_gap_resolutions to service_role;
create policy gap_server_read on public.knowledge_gaps for select to service_role using(true);
create policy gap_occurrences_server_read on public.knowledge_gap_occurrences for select to service_role using(true);
create policy gap_resolutions_server_read on public.knowledge_gap_resolutions for select to service_role using(true);

create function public.record_knowledge_gap(p_organization_id uuid,p_event_id uuid,p_expected_revision integer,p_product_id uuid,p_field text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; g public.knowledge_gaps; new_id uuid; stamp timestamptz:=clock_timestamp();
begin
 if p_field is null or p_field not in('price','availability','specification','compatibility','policy','service','program','delivery','warranty') or p_reason is null or p_reason not in('missing_evidence','lookup_failed') then raise exception 'GAP_INVALID' using errcode='22023'; end if;
 if p_product_id is not null then
  perform 1 from public.products where id=p_product_id and organization_id=p_organization_id for share;
  if not found then raise exception 'GAP_INVALID' using errcode='22023'; end if;
 end if;
 -- Conversation locking precedes gap locking in every ingress call. Both changes
 -- commit together; an unavailable gap store cannot leave a successful AI answer.
 c:=public.request_conversation_handoff(p_organization_id,p_event_id,p_expected_revision,p_reason);
 if not exists(select 1 from public.conversation_handoff_decisions where source_event_id=p_event_id) then
  return jsonb_build_object('gapId',null,'ignored',true); -- suppressed pre-completion backlog
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||coalesce(p_product_id::text,'business')||p_field||p_reason,450));
 select * into g from public.knowledge_gaps where organization_id=p_organization_id and product_id is not distinct from p_product_id and field=p_field and reason=p_reason for update;
 if g.id is not null and exists(select 1 from public.knowledge_gap_occurrences where gap_id=g.id and source_event_id=p_event_id) then
  return jsonb_build_object('gapId',g.id,'ignored',false);
 end if;
 -- Exact receipts above stay replayable. A changed classification from an old
 -- completed handoff cannot create new work after staff resumed the conversation.
 if c->>'status'='AI_ACTIVE' or not exists(select 1 from public.conversation_handoff_decisions where source_event_id=p_event_id and handoff_id=(c->>'activeHandoffId')::uuid) then
  return jsonb_build_object('gapId',null,'ignored',true);
 end if;
 if g.id is null then
  insert into public.knowledge_gaps(organization_id,product_id,field,reason,status,version,occurrences,last_conversation_id)
  values(p_organization_id,p_product_id,p_field,p_reason,'OPEN',1,1,(c->>'id')::uuid) returning id into new_id;
 else
  new_id:=g.id;
  update public.knowledge_gaps set status='OPEN',version=version+1,occurrences=occurrences+1,last_conversation_id=(c->>'id')::uuid,updated_at=stamp,resolved_at=null where id=g.id;
 end if;
 insert into public.knowledge_gap_occurrences(gap_id,source_event_id,organization_id,conversation_id) values(new_id,p_event_id,p_organization_id,(c->>'id')::uuid);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'system','knowledge.gap_recorded','knowledge_gap',new_id,p_reason,p_event_id,gen_random_uuid());
 return jsonb_build_object('gapId',new_id,'ignored',false);
end $$;

create function public.resolve_knowledge_gap(p_organization_id uuid,p_actor_id uuid,p_id uuid,p_expected_version integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.knowledge_gaps; receipt public.knowledge_gap_resolutions;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'GAP_FORBIDDEN' using errcode='42501'; end if;
 if p_request_id is null or p_id is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 then raise exception 'GAP_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,451));
 select * into receipt from public.knowledge_gap_resolutions where request_id=p_request_id;
 if found then
  if row(receipt.organization_id,receipt.actor_id,receipt.gap_id,receipt.expected_version) is distinct from row(p_organization_id,p_actor_id,p_id,p_expected_version) then raise exception 'GAP_CONFLICT' using errcode='40001'; end if;
  return jsonb_build_object('id',p_id,'version',receipt.version);
 end if;
 select * into g from public.knowledge_gaps where id=p_id and organization_id=p_organization_id for update;
 if not found then raise exception 'GAP_FORBIDDEN' using errcode='42501'; end if;
 if g.version<>p_expected_version or g.status<>'OPEN' then raise exception 'GAP_CONFLICT' using errcode='40001'; end if;
 update public.knowledge_gaps set status='RESOLVED',version=version+1,resolved_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;
 insert into public.knowledge_gap_resolutions(request_id,gap_id,organization_id,actor_id,expected_version,version) values(p_request_id,p_id,p_organization_id,p_actor_id,p_expected_version,p_expected_version+1);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'knowledge.gap_resolved','knowledge_gap',p_id,'manager.updated_sources',p_request_id,p_request_id);
 return jsonb_build_object('id',p_id,'version',p_expected_version+1);
end $$;

create function public.read_knowledge_gaps(p_organization_id uuid,p_actor_id uuid,p_status text,p_page integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'GAP_FORBIDDEN' using errcode='42501'; end if;
 if p_status is null or p_status not in('OPEN','RESOLVED') or p_page is null or p_page not between 1 and 10000 then raise exception 'GAP_INVALID' using errcode='22023'; end if;
 select jsonb_build_object('page',p_page,'total',(select count(*) from public.knowledge_gaps where organization_id=p_organization_id and status=p_status),'items',coalesce(jsonb_agg(x.data),'[]'::jsonb)) into result from (
  select jsonb_build_object('id',g.id,'productId',g.product_id,'productName',p.name,'field',g.field,'reason',g.reason,'status',g.status,'version',g.version,'occurrences',g.occurrences,'updatedAt',g.updated_at,'conversationId',g.last_conversation_id,'resolvedAt',g.resolved_at) data
  from public.knowledge_gaps g left join public.products p on p.id=g.product_id where g.organization_id=p_organization_id and g.status=p_status order by g.updated_at desc,g.id limit 20 offset(p_page-1)*20
 ) x;
 return result;
end $$;
revoke all on function public.record_knowledge_gap(uuid,uuid,integer,uuid,text,text),public.resolve_knowledge_gap(uuid,uuid,uuid,integer,uuid),public.read_knowledge_gaps(uuid,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.record_knowledge_gap(uuid,uuid,integer,uuid,text,text),public.resolve_knowledge_gap(uuid,uuid,uuid,integer,uuid),public.read_knowledge_gaps(uuid,uuid,text,integer) to service_role;
