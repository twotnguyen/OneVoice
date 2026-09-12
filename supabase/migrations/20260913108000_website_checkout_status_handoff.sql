-- SPDX-License-Identifier: Apache-2.0
-- WEB checkout/status route outcomes persist a reply candidate so web_outbound
-- can deliver confirmation/status text. No new tables. Messenger trigger still
-- no-ops unless conversations.channel=FACEBOOK.
create or replace function public.finish_consultation(p_job_id uuid,p_owner uuid,p_token uuid,p_outcome jsonb) returns boolean language plpgsql security definer set search_path='' as $$
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
 elsif o->>'type'='route' then
  if o->>'route' not in('checkout','order_status') then raise exception 'invalid_consultation_route' using errcode='22023';end if;
  if coalesce(char_length(o->>'text') between 1 and 1800,false) then
   v_candidate:=jsonb_build_object('id',r.event_id,'type','reply','conversationId',c.id,'revision',c.revision,'text',o->'text','claims','[]'::jsonb);
  end if;
 end if;
 if j.lease_expires_at<=clock_timestamp() or j.attempt_started_at+interval '40 seconds'<=clock_timestamp() then raise exception 'consultation_lease_expired' using errcode='40001';end if;
 update public.consultation_receipts set status='completed',outcome=o,candidate=v_candidate,completed_at=clock_timestamp() where event_id=r.event_id;
 update public.business_jobs set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null,last_error=null where id=j.id;
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(j.organization_id,'system','consultation.completed','conversation',c.id,'consultation.'||(o->>'type'),r.event_id,r.event_id);
 return true;
end $$;
revoke all on function public.finish_consultation(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.finish_consultation(uuid,uuid,uuid,jsonb) to service_role;
