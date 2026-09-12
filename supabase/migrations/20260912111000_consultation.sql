-- Durable consultation decisions. No delivery/outbox actions belong to this transaction.
create table public.consultation_receipts (
 event_id uuid primary key references public.facebook_inbound_events(id),
 job_id uuid not null unique references public.business_jobs(id),
 organization_id uuid not null references public.organizations(id),
 conversation_id uuid references public.conversations(id),
 revision integer not null, lease_token uuid not null,
 status text not null check(status in('running','completed')),
 outcome jsonb, candidate jsonb,
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 check((status='completed')=(outcome is not null and completed_at is not null)),
 check(outcome is null or octet_length(outcome::text)<=65536),
 check(candidate is null or octet_length(candidate::text)<=65536)
);
create unique index consultation_one_running on public.consultation_receipts(conversation_id) where status='running';
alter table public.consultation_receipts enable row level security;
revoke all on public.consultation_receipts from public,anon,authenticated,service_role;
grant select on public.consultation_receipts to service_role;
create policy consultation_server_read on public.consultation_receipts for select to service_role using(true);
create function public.protect_consultation_receipt() returns trigger language plpgsql set search_path='' as $$
begin if tg_op='DELETE' or old.status='completed' then raise exception 'immutable_consultation_receipt';end if;return new;end $$;
create trigger consultation_immutable before update or delete on public.consultation_receipts for each row execute function public.protect_consultation_receipt();
create trigger consultation_no_truncate before truncate on public.consultation_receipts for each statement execute function public.reject_audit_mutation();
revoke all on function public.protect_consultation_receipt() from public,anon,authenticated,service_role;

-- Trusted-service finish; exact operational values are verified again under locks.
create function public.finish_consultation(p_job_id uuid,p_owner uuid,p_token uuid,p_outcome jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; r public.consultation_receipts; c public.conversations; o jsonb:=p_outcome; v_candidate jsonb; claim jsonb; snap jsonb; row_data jsonb; field text; value jsonb; matched boolean; handoff jsonb; gap_result jsonb; previous_handoff uuid; reason text;
begin
 select * into j from public.business_jobs where id=p_job_id for update;
 select * into r from public.consultation_receipts where job_id=p_job_id;
 if r.status='completed' then return r.lease_token=p_token;end if;
 if r.event_id is null or j.status<>'running' or j.lease_owner is distinct from p_owner or j.lease_token is distinct from p_token or r.lease_token is distinct from p_token then return false;end if;
 select * into c from public.conversations where id=r.conversation_id for update;
 if j.lease_expires_at<=clock_timestamp() or j.attempt_started_at+interval '40 seconds'<=clock_timestamp() then return false;end if;
 if o is null or jsonb_typeof(o)<>'object' or octet_length(o::text)>65536 or coalesce(o->>'type','') not in('reply','handoff','gap','route') then raise exception 'invalid_consultation_outcome' using errcode='22023';end if;
 if c.status<>'AI_ACTIVE' or c.revision<>r.revision or exists(select 1 from public.conversation_messages m where m.inbound_event_id=r.event_id and m.ai_disposition<>'eligible') then
  o:=jsonb_build_object('type','suppressed','reason','conversation_changed');
 elsif o->>'type'='reply' then
  if not coalesce(char_length(o->>'text') between 1 and 1800 and jsonb_typeof(o->'claims')='array' and jsonb_array_length(o->'claims')<=8,false) then raise exception 'invalid_consultation_reply' using errcode='22023';end if;
  for claim in select item from jsonb_array_elements(o->'claims') item union all select nested from jsonb_array_elements(o->'claims') item cross join lateral jsonb_array_elements(coalesce(item->'canonicalSpecs','[]')) nested loop
   matched:=false;
   if claim->>'kind' in('catalog','catalog_snapshot') then
    perform 1 from public.products where id=(claim->>'productId')::uuid and organization_id=j.organization_id for share;
    if claim->>'variantId' is not null then perform 1 from public.product_variants where id=(claim->>'variantId')::uuid and product_id=(claim->>'productId')::uuid for share;end if;
    snap:=public.lookup_consultation_evidence(j.organization_id,jsonb_build_object('operation','compare_products','items',jsonb_build_array(jsonb_build_object('productId',claim->'productId','variantId',claim->'variantId'))));
    row_data:=snap#>'{products,0}';field:=claim->>'field';value:=null;
    if claim->>'kind'='catalog_snapshot' then
     select coalesce(jsonb_object_agg(specs.key,specs.value),'{}') into value from (select 'spec:'||lower(btrim(s->>'name')) key,case when count(distinct btrim(s->>'value'))=1 then min(btrim(s->>'value')) else null end value from jsonb_array_elements(row_data->'specifications') s group by lower(btrim(s->>'name'))) specs;
     matched:=row_data->>'specificationsComplete'='true' and row_data->'version'=claim->'version' and row_data->'variantUpdatedAt' is not distinct from claim->'variantUpdatedAt' and value=claim->'specs';
    else
    if field='price_vnd' then value:=row_data->'priceVnd';
    elsif field='stock_quantity' and row_data->>'inStock'='true' and (row_data->>'stockQuantity')::numeric>0 then value:=row_data->'stockQuantity';
    elsif field like 'spec:%' and row_data->>'specificationsComplete'='true' then
     select case when count(distinct s->>'value')=1 then to_jsonb(min(s->>'value')) else null end into value from jsonb_array_elements(row_data->'specifications') s where lower(btrim(s->>'name'))=substring(field from 6);
    end if;
    matched:=row_data->'name'=claim->'name' and row_data->'sku'=claim->'sku' and row_data->'version'=claim->'version' and row_data->'variantUpdatedAt' is not distinct from claim->'variantUpdatedAt' and value is not null and value<>'null'::jsonb and value=claim->'value';
    end if;
   elsif claim->>'kind' in('policy','promotion') then
    if claim->>'kind'='policy' then perform 1 from public.business_policies where id=(claim->>'id')::uuid and organization_id=j.organization_id for share;
    else perform 1 from public.promotions where id=(claim->>'id')::uuid and organization_id=j.organization_id for share;end if;
    snap:=public.lookup_consultation_evidence(j.organization_id,jsonb_build_object('operation','read_guidance','productId',claim->'productId','query',''));
    select exists(select 1 from jsonb_array_elements(snap->case when claim->>'kind'='policy' then 'policies' else 'promotions' end) x where x->'id'=claim->'id' and x->'version'=claim->'version' and x->'startsAt' is not distinct from claim->'startsAt' and x->'expiresAt' is not distinct from claim->'expiresAt' and x->'title'=claim->'title' and x->'body'=claim->'value' and (claim->>'kind'='policy' or (x->'discountType' is not distinct from claim->'discountType' and x->'discountValue' is not distinct from claim->'discountValue' and x->'startsAt' is not distinct from claim->'startsAt' and x->'expiresAt' is not distinct from claim->'expiresAt'))) into matched;
   elsif claim->>'kind'='knowledge' then
    perform 1 from public.knowledge_sources where id=(claim->>'sourceId')::uuid and organization_id=j.organization_id for share;
    snap:=public.read_current_knowledge(j.organization_id,(claim->>'sourceId')::uuid);
    matched:=snap->'name'=claim->'name' and snap->'expiresAt'=claim->'expiresAt' and snap->'sourceVersion'=claim->'sourceVersion' and snap->'hash'=claim->'hash' and ((claim->>'productId' is null and snap->'productIds'='[]') or snap->'productIds' ? (claim->>'productId')) and exists(select 1 from jsonb_array_elements_text(snap->'chunks') body where strpos(body,claim->>'value')>0 and char_length(claim->>'value') between 1 and 500);
   end if;
   if not coalesce(matched,false) then o:=jsonb_build_object('type','gap','intent','needs','reason','missing_evidence','field','specification');exit;end if;
  end loop;
  -- Time validity is checked again after ALL locks, not only when each record was read.
  if o->>'type'='reply' and exists(select 1 from jsonb_array_elements(o->'claims') x where (x->>'expiresAt' is not null and (x->>'expiresAt')::timestamptz<=clock_timestamp()) or (x->>'startsAt' is not null and (x->>'startsAt')::timestamptz>clock_timestamp())) then o:=jsonb_build_object('type','gap','intent','needs','reason','missing_evidence','field','specification');end if;
  if o->>'type'='reply' then v_candidate:=jsonb_build_object('id',r.event_id,'type','reply','conversationId',c.id,'revision',c.revision,'text',o->'text','claims',o->'claims');end if;
 end if;
 if o->>'type' in('gap','handoff') then
  reason:=o->>'reason';previous_handoff:=c.active_handoff_id;
  if o->>'type'='gap' then
   if reason not in('missing_evidence','lookup_failed') then raise exception 'invalid_gap_reason' using errcode='22023';end if;
   gap_result:=public.record_knowledge_gap(j.organization_id,r.event_id,c.revision,(o->>'productId')::uuid,o->>'field',reason);
   o:=o||jsonb_build_object('gap',gap_result);
  else
   if reason not in('customer_requested','return_request','warranty_request') then raise exception 'invalid_handoff_reason' using errcode='22023';end if;
   handoff:=public.request_conversation_handoff(j.organization_id,r.event_id,c.revision,reason);
  end if;
  select * into c from public.conversations where id=c.id;
  if previous_handoff is null and c.active_handoff_id is not null then
   v_candidate:=jsonb_build_object('id',r.event_id,'type','handoff_ack','conversationId',c.id,'revision',c.revision,'handoffId',c.active_handoff_id,'text',case when o->>'type'='gap' then 'Mình là trợ lý AI. Thông tin này cần được kiểm tra thêm; mình đã chuyển yêu cầu cho nhân viên.' else 'Mình là trợ lý AI. Mình đã chuyển yêu cầu của bạn cho nhân viên hỗ trợ.' end,'claims','[]'::jsonb);
  end if;
 elsif o->>'type'='route' and o->>'route' not in('checkout','order_status') then raise exception 'invalid_consultation_route' using errcode='22023';end if;
 -- Recheck after every potentially blocking evidence/handoff lock. Raising rolls back all mutations.
 if j.lease_expires_at<=clock_timestamp() or j.attempt_started_at+interval '40 seconds'<=clock_timestamp() then raise exception 'consultation_lease_expired' using errcode='40001';end if;
 update public.consultation_receipts set status='completed',outcome=o,candidate=v_candidate,completed_at=clock_timestamp() where event_id=r.event_id;
 update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null,last_error=null where id=j.id;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(j.organization_id,'system','consultation.completed','conversation',c.id,'consultation.'||(o->>'type'),r.event_id,r.event_id);
 return true;
end $$;

create function public.claim_consultation_job(p_owner uuid,p_organization_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.business_jobs; e public.facebook_inbound_events; c public.conversations; projected jsonb; r public.consultation_receipts; history jsonb; exhausted boolean;
begin
 if p_owner is null or p_organization_id is null then raise exception 'invalid_consultation_claim' using errcode='22023';end if;
 for j in select b.* from public.business_jobs b join public.facebook_inbound_events f on f.id=b.entity_id and f.organization_id=b.organization_id
 where b.organization_id=p_organization_id and b.kind='inbound_event' and f.kind in('message','postback','referral') and ((b.status='queued' and b.available_at<=clock_timestamp()) or (b.status='running' and b.lease_expires_at<=clock_timestamp()) or (b.status in('dead','succeeded') and not exists(select 1 from public.consultation_receipts x where x.event_id=f.id and x.status='completed')))
 order by f.received_at,f.id for update of b skip locked limit 100 loop
  select * into e from public.facebook_inbound_events where id=j.entity_id;
  if e.sender_id is null or e.sender_id=e.page_id or e.recipient_id is distinct from e.page_id then
   insert into public.consultation_receipts(event_id,job_id,organization_id,conversation_id,revision,lease_token,status,outcome,completed_at) values(e.id,j.id,j.organization_id,null,0,gen_random_uuid(),'completed','{"type":"ignored","reason":"invalid_private_identity"}',clock_timestamp()) on conflict(event_id) do nothing;
   update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
   continue;
  end if;
  -- Check all earlier durable inputs, including jobs waiting for backoff or locked by another worker.
  if exists(select 1 from public.business_jobs b join public.facebook_inbound_events f on f.id=b.entity_id and f.organization_id=b.organization_id where b.kind='inbound_event' and f.kind in('message','postback','referral') and f.organization_id=e.organization_id and f.page_id=e.page_id and f.sender_id=e.sender_id and (f.received_at,f.id)<(e.received_at,e.id) and not exists(select 1 from public.consultation_receipts x where x.event_id=f.id and x.status='completed')) then continue;end if;
  projected:=public.project_facebook_conversation(j.organization_id,e.id);
  select * into c from public.conversations where id=(projected#>>'{conversation,id}')::uuid for update;
  if exists(select 1 from public.consultation_receipts x where x.conversation_id=c.id and x.status='running' and x.event_id<>e.id) then continue;end if;
  select * into r from public.consultation_receipts where event_id=e.id;
  if r.status='completed' then continue;end if;
  exhausted:=j.attempts>=least(3,j.max_attempts);
  update public.business_jobs set status='running',attempts=case when exhausted then attempts else attempts+1 end,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_started_at=clock_timestamp() where id=j.id returning * into j;
  insert into public.consultation_receipts(event_id,job_id,organization_id,conversation_id,revision,lease_token,status) values(e.id,j.id,j.organization_id,c.id,c.revision,j.lease_token,'running') on conflict(event_id) do update set lease_token=excluded.lease_token,revision=excluded.revision;
  if exhausted or not (projected->>'aiEligible')::boolean then
   perform public.finish_consultation(j.id,p_owner,j.lease_token,'{"type":"gap","intent":"needs","field":"specification","reason":"lookup_failed"}');
   if exhausted then update public.business_jobs set status='dead',last_error='lease_expired' where id=j.id;end if;
   continue;
  end if;
  select coalesce(jsonb_agg(h.item order by h.received_at,h.id),'[]') into history from (select m.id,m.received_at,jsonb_build_object('text',left(coalesce(m.data->>'text',m.data#>>'{postback,title}',''),600),'decision',case when x.status='completed' then jsonb_build_object('intent',x.outcome->'intent','query',x.outcome->'query','catalogItems',(select coalesce(jsonb_agg(items.item),'[]') from (select distinct jsonb_build_object('productId',claim->'productId','variantId',claim->'variantId','name',claim->'name','sku',claim->'sku') item from jsonb_array_elements(coalesce(x.candidate->'claims','[]')) claim where claim->>'kind'='catalog' limit 8) items)) else null end) item from public.conversation_messages m left join public.consultation_receipts x on x.event_id=m.inbound_event_id where m.conversation_id=c.id and (m.received_at,m.inbound_event_id)<(e.received_at,e.id) order by m.received_at desc,m.inbound_event_id desc limit 8) h;
  return jsonb_build_object('job',to_jsonb(j),'conversationId',c.id,'revision',c.revision,'organizationId',j.organization_id,'text',left(coalesce(e.data->>'text',e.data#>>'{postback,title}',''),4000),'history',history,'introduce',not exists(select 1 from public.consultation_receipts x where x.conversation_id=c.id and x.status='completed' and x.revision=c.revision and x.candidate->>'type'='reply'));
 end loop;
 return null;
end $$;

-- Generic jobs must leave private ingress to the serialized consultation claimant.
create or replace function public.claim_business_job(p_owner uuid,p_lease_seconds integer default 60,p_now timestamptz default clock_timestamp()) returns setof public.business_jobs language plpgsql security definer set search_path='' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023';end if;
 for j in select b.* from public.business_jobs b where b.kind<>'knowledge_ingest' and not (b.kind='inbound_event' and exists(select 1 from public.facebook_inbound_events e where e.id=b.entity_id and e.organization_id=b.organization_id and e.kind in('message','postback','referral'))) and ((b.status='queued' and b.available_at<=p_now) or (b.status='running' and b.lease_expires_at<=p_now)) order by b.available_at,b.id for update of b skip locked loop
  if j.attempts>=j.max_attempts then update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,last_error=case when j.status='running' then 'lease_expired' else last_error end where id=j.id returning *;return;end if;
 end loop;
end $$;
revoke all on function public.claim_consultation_job(uuid,uuid),public.finish_consultation(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.claim_consultation_job(uuid,uuid),public.finish_consultation(uuid,uuid,uuid,jsonb) to service_role;
