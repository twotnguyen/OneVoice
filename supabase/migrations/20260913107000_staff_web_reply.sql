-- SPDX-License-Identifier: Apache-2.0
-- OV-059 staff website reply. Persist VISIBLE web_outbound immediately; no Graph, no messenger_outbox.

alter table public.web_outbound alter column inbound_event_id drop not null;
alter table public.web_outbound drop constraint if exists web_outbound_inbound_event_id_key;
drop index if exists public.web_outbound_inbound_event_id_key;
create unique index if not exists web_outbound_inbound_event_unique on public.web_outbound(inbound_event_id) where inbound_event_id is not null;

create or replace function public.enqueue_web_outbound_from_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.conversations; body text; kind text; handoff uuid; digest text; outbox_id uuid; request uuid;
begin
 kind := new.candidate->>'type';
 if kind not in ('reply','handoff_ack') then return new; end if;
 body := new.candidate->>'text';
 if body is null or char_length(body) not between 1 and 1800 then raise exception 'invalid_web_candidate' using errcode='22023'; end if;
 select * into c from public.conversations where id=new.conversation_id for update;
 if not found then raise exception 'invalid_web_candidate' using errcode='22023'; end if;
 if c.channel is distinct from 'WEB' then return new; end if;
 handoff := nullif(new.candidate->>'handoffId','')::uuid;
 if kind='handoff_ack' and handoff is null then raise exception 'invalid_web_candidate' using errcode='22023'; end if;
 digest := encode(sha256(convert_to(jsonb_build_object('channelUserKey',c.channel_user_key,'kind',kind,'text',body)::text,'UTF8')),'hex');
 request := gen_random_uuid();
 insert into public.web_outbound(organization_id,inbound_event_id,conversation_id,conversation_revision,kind,handoff_id,payload_hash,request_key,text,status)
 values(new.organization_id,new.event_id,c.id,coalesce((new.candidate->>'revision')::integer,c.revision),kind,handoff,digest,request,body,'PENDING')
 on conflict(inbound_event_id) where inbound_event_id is not null do nothing returning id,request_key into outbox_id,request;
 if outbox_id is null then return new; end if;
 perform public.enqueue_business_job(new.organization_id,'outbound_message',outbox_id,request,clock_timestamp(),5);
 insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(new.organization_id,'system','web.queued','web_outbound',outbox_id,kind,new.event_id,outbox_id);
 return new;
end $$;

create function public.staff_web_reply(p_organization_id uuid, p_actor_id uuid, p_conversation_id uuid, p_expected_revision integer, p_request_id uuid, p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations; h public.conversation_handoffs; actor_role text; receipt public.conversation_transition_receipts; fingerprint text; result jsonb; body text; digest text; outbox public.web_outbound;
begin
 select role into actor_role from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role in ('staff','manager') for share;
 if not found then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_text is null then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 body := btrim(p_text);
 if char_length(body) not between 1 and 1800 then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 select * into c from public.conversations where id=p_conversation_id and organization_id=p_organization_id for update;
 if not found then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 fingerprint := encode(sha256(convert_to(jsonb_build_array(p_conversation_id,p_expected_revision,'reply',body)::text,'UTF8')),'hex');
 select * into receipt from public.conversation_transition_receipts where request_id=p_request_id;
 if found then
  if receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.fingerprint<>fingerprint then raise exception 'conversation_version_conflict' using errcode='40001'; end if;
  return receipt.result;
 end if;
 if c.channel is distinct from 'WEB' then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 if c.revision<>p_expected_revision then raise exception 'conversation_version_conflict' using errcode='40001'; end if;
 if c.status is distinct from 'STAFF_ACTIVE' then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 select * into h from public.conversation_handoffs where id=c.active_handoff_id;
 if not found then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 if h.claimed_by is distinct from p_actor_id and actor_role is distinct from 'manager' then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 digest := encode(sha256(convert_to(jsonb_build_object('channelUserKey',c.channel_user_key,'kind','reply','text',body,'actor',p_actor_id)::text,'UTF8')),'hex');
 insert into public.web_outbound(organization_id,inbound_event_id,conversation_id,conversation_revision,kind,handoff_id,payload_hash,request_key,text,status)
 values(p_organization_id,null,c.id,c.revision,'reply',null,digest,p_request_id,body,'VISIBLE')
 returning * into outbox;
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'conversation.staff_replied','web_outbound',outbox.id,'staff_reply',c.id,p_request_id);
 result := jsonb_build_object('id',outbox.id,'status',c.status,'revision',c.revision,'kind','reply','outboundId',outbox.id);
 insert into public.conversation_transition_receipts(request_id,organization_id,actor_id,fingerprint,result) values(p_request_id,p_organization_id,p_actor_id,fingerprint,result);
 return result;
end $$;
revoke all on function public.staff_web_reply(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.staff_web_reply(uuid,uuid,uuid,integer,uuid,text) to service_role;
