-- SPDX-License-Identifier: Apache-2.0
-- Staff tracking only. Eligibility is a paid, delivered native order line; no AI approval.
create table public.warranty_cases (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 order_id uuid not null, line_number integer not null,
 status text not null check(status in('RECEIVED','INSPECTING','IN_SERVICE','READY','COMPLETED')),
 version integer not null check(version>0), customer_note text not null, private_note text not null,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 foreign key(order_id,line_number) references public.order_items(order_id,line_number) on delete restrict
);
create index warranty_scope_updated on public.warranty_cases(organization_id,updated_at desc,id);
create table public.warranty_history (
 request_id uuid primary key, case_id uuid not null references public.warranty_cases(id), organization_id uuid not null references public.organizations(id),
 actor_id uuid not null, expected_version integer not null, version integer not null,
 order_id uuid not null, line_number integer not null, status text not null, customer_note text not null, private_note text not null,
 created_at timestamptz not null default clock_timestamp(), unique(case_id,version)
);
create trigger warranty_history_immutable before update or delete on public.warranty_history for each row execute function public.reject_audit_mutation();
create trigger warranty_history_no_truncate before truncate on public.warranty_history for each statement execute function public.reject_audit_mutation();
alter table public.warranty_cases enable row level security;
alter table public.warranty_history enable row level security;
revoke all on public.warranty_cases,public.warranty_history from public,anon,authenticated,service_role;
grant select on public.warranty_cases,public.warranty_history to service_role;
create policy warranty_server_read on public.warranty_cases for select to service_role using(true);
create policy warranty_history_server_read on public.warranty_history for select to service_role using(true);

create function public.save_warranty_case(p_organization_id uuid,p_actor_id uuid,p_id uuid,p_request_id uuid,p_expected_version integer,p_order_id uuid,p_line_number integer,p_status text,p_customer_note text,p_private_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.warranty_history; old public.warranty_cases; phases text[]:=array['RECEIVED','INSPECTING','IN_SERVICE','READY','COMPLETED']; changed timestamptz:=clock_timestamp();
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in('staff','manager') for share;
 if not found then raise exception 'WARRANTY_FORBIDDEN' using errcode='42501'; end if;
 if p_id is null or p_request_id is null or p_order_id is null or p_expected_version is null or p_expected_version not between 0 and 2147483646 or p_line_number is null or p_line_number not between 1 and 100 or p_status is null or not p_status=any(phases) or p_customer_note is null or p_private_note is null or length(p_customer_note)>4000 or length(p_private_note)>4000 then raise exception 'WARRANTY_INVALID' using errcode='22023'; end if;
 if (p_customer_note||p_private_note) ~* '</?[[:alpha:]][^>]*>' or translate(p_customer_note||p_private_note,E'\n\r\t','') ~ '[[:cntrl:]]' then raise exception 'WARRANTY_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,260));
 select * into prior from public.warranty_history where request_id=p_request_id;
 if found then
  if row(prior.organization_id,prior.actor_id,prior.case_id,prior.expected_version,prior.order_id,prior.line_number,prior.status,prior.customer_note,prior.private_note) is distinct from row(p_organization_id,p_actor_id,p_id,p_expected_version,p_order_id,p_line_number,p_status,p_customer_note,p_private_note) then raise exception 'WARRANTY_CONFLICT' using errcode='40001'; end if;
  return jsonb_build_object('id',p_id,'version',prior.version);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,261));
 select * into old from public.warranty_cases where id=p_id for update;
 if found and old.organization_id<>p_organization_id then raise exception 'WARRANTY_FORBIDDEN' using errcode='42501'; end if;
 if coalesce(old.version,0)<>p_expected_version then raise exception 'WARRANTY_CONFLICT' using errcode='40001'; end if;
 if old.id is not null and (old.order_id<>p_order_id or old.line_number<>p_line_number) then raise exception 'WARRANTY_FORBIDDEN' using errcode='42501'; end if;
 if (old.id is null and p_status<>'RECEIVED') or (old.id is not null and p_status<>old.status and array_position(phases,p_status)<>array_position(phases,old.status)+1) then raise exception 'WARRANTY_TRANSITION' using errcode='22023'; end if;
 perform 1 from public.orders o join public.order_items i on i.order_id=o.id and i.line_number=p_line_number
 where o.id=p_order_id and o.organization_id=p_organization_id and o.payment_status='PAID' and o.fulfilment_status='DELIVERED' and o.checkout_frozen_at is not null for share of o;
 if not found then raise exception 'WARRANTY_INELIGIBLE' using errcode='22023'; end if;
 insert into public.warranty_cases(id,organization_id,order_id,line_number,status,version,customer_note,private_note)
 values(p_id,p_organization_id,p_order_id,p_line_number,p_status,p_expected_version+1,p_customer_note,p_private_note)
 on conflict(id) do update set status=excluded.status,version=excluded.version,customer_note=excluded.customer_note,private_note=excluded.private_note,updated_at=changed;
 insert into public.warranty_history(request_id,case_id,organization_id,actor_id,expected_version,version,order_id,line_number,status,customer_note,private_note)
 values(p_request_id,p_id,p_organization_id,p_actor_id,p_expected_version,p_expected_version+1,p_order_id,p_line_number,p_status,p_customer_note,p_private_note);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'warranty.saved','warranty_case',p_id,'staff.progress',p_request_id,p_request_id);
 return jsonb_build_object('id',p_id,'version',p_expected_version+1);
end $$;

create function public.internal_warranty_record(p_id uuid,p_include_history boolean default true) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',w.id,'orderId',w.order_id,'lineNumber',w.line_number,'version',w.version,'status',w.status,'customerNote',w.customer_note,'privateNote',w.private_note,'buyerName',o.buyer_name,'productName',i.name,'sku',i.sku,'updatedAt',w.updated_at,
 'history',coalesce((select jsonb_agg(jsonb_build_object('version',h.version,'status',h.status,'customerNote',h.customer_note,'privateNote',h.private_note,'createdAt',h.created_at) order by h.version desc) from (select * from public.warranty_history where case_id=w.id and p_include_history order by version desc limit 100) h),'[]'::jsonb))
 from public.warranty_cases w join public.orders o on o.id=w.order_id join public.order_items i on i.order_id=w.order_id and i.line_number=w.line_number where w.id=p_id
$$;
create function public.read_staff_warranty(p_organization_id uuid,p_actor_id uuid,p_id uuid default null,p_search text default '',p_page integer default 1,p_orders boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; term text;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in('staff','manager') for share;
 if not found then raise exception 'WARRANTY_FORBIDDEN' using errcode='42501'; end if;
 if p_page is null or p_page not between 1 and 10000 or p_search is null or length(p_search)>100 then raise exception 'WARRANTY_INVALID' using errcode='22023'; end if;
 term:='%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%';
 if p_orders then
  select coalesce(jsonb_agg(x.data),'[]'::jsonb) into result from (
   select jsonb_build_object('orderId',o.id,'lineNumber',i.line_number,'buyerName',o.buyer_name,'productName',i.name,'sku',i.sku,'quantity',i.quantity,'orderedAt',o.created_at) data
   from public.orders o join public.order_items i on i.order_id=o.id
   where o.organization_id=p_organization_id and o.payment_status='PAID' and o.fulfilment_status='DELIVERED' and o.checkout_frozen_at is not null
   and (coalesce(o.buyer_name,'') ilike term or i.name ilike term or coalesce(i.sku,'') ilike term)
   order by o.created_at desc,o.id,i.line_number limit 20 offset (p_page-1)*20) x;
  return result;
 end if;
 if p_id is not null then
  if not exists(select 1 from public.warranty_cases where id=p_id and organization_id=p_organization_id) then return null; end if;
  return public.internal_warranty_record(p_id);
 end if;
 select jsonb_build_object('page',p_page,'total',count(*),'items',coalesce((select jsonb_agg(public.internal_warranty_record(x.id,false)) from (
  select w.id from public.warranty_cases w join public.orders o on o.id=w.order_id join public.order_items i on i.order_id=w.order_id and i.line_number=w.line_number
  where w.organization_id=p_organization_id and (coalesce(o.buyer_name,'') ilike term or i.name ilike term or coalesce(i.sku,'') ilike term)
  order by w.updated_at desc,w.id limit 20 offset (p_page-1)*20) x),'[]'::jsonb)) into result
 from public.warranty_cases w join public.orders o on o.id=w.order_id join public.order_items i on i.order_id=w.order_id and i.line_number=w.line_number
 where w.organization_id=p_organization_id and (coalesce(o.buyer_name,'') ilike term or i.name ilike term or coalesce(i.sku,'') ilike term);
 return result;
end $$;

-- Trusted conversation adapter only. The server must verify channel/customer ownership
-- before binding conversation ID; client/model input cannot establish that scope.
create function public.read_customer_warranty(p_organization_id uuid,p_conversation_id uuid,p_order_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'status',w.status,'customerNote',w.customer_note,'updatedAt',w.updated_at,
  'history',coalesce((select jsonb_agg(jsonb_build_object('version',h.version,'status',h.status,'customerNote',h.customer_note,'createdAt',h.created_at) order by h.version desc) from (select * from public.warranty_history where case_id=w.id order by version desc limit 100) h),'[]'::jsonb)) order by w.updated_at desc),'[]'::jsonb)
 from public.warranty_cases w join public.orders o on o.id=w.order_id
 where w.organization_id=p_organization_id and o.organization_id=p_organization_id and o.id=p_order_id and o.conversation_id=p_conversation_id and p_conversation_id is not null
$$;
revoke all on function public.internal_warranty_record(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.save_warranty_case(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text), public.read_staff_warranty(uuid,uuid,uuid,text,integer,boolean),public.read_customer_warranty(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_warranty_case(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text),public.read_staff_warranty(uuid,uuid,uuid,text,integer,boolean),public.read_customer_warranty(uuid,uuid,uuid) to service_role;
