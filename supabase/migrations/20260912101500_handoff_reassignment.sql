-- SPDX-License-Identifier: Apache-2.0
-- OV-015: audited manager recovery from abandoned/disabled staff assignments.
create table public.conversation_handoff_assignments (
 id uuid primary key default gen_random_uuid(),
 handoff_id uuid not null references public.conversation_handoffs(id),
 previous_actor_id uuid not null references auth.users(id),
 previous_claimed_at timestamptz not null,
 assigned_actor_id uuid not null references auth.users(id),
 manager_actor_id uuid not null references auth.users(id),
 request_id uuid not null unique,
 assigned_at timestamptz not null default clock_timestamp()
);
alter table public.conversation_handoff_assignments enable row level security;
revoke all on public.conversation_handoff_assignments from public,anon,authenticated,service_role;
grant select on public.conversation_handoff_assignments to service_role;
create policy handoff_assignment_service_read on public.conversation_handoff_assignments for select to service_role using(true);
create function public.reassign_conversation_handoff(p_organization_id uuid,p_actor_id uuid,p_conversation_id uuid,p_expected_revision integer,p_assignee_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations; h public.conversation_handoffs; receipt public.conversation_transition_receipts; fingerprint text; result jsonb;
begin
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 perform 1 from public.staff_profiles where user_id=p_assignee_id and organization_id=p_organization_id and active and role in ('staff','manager') for share;
 if not found then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 select * into c from public.conversations where id=p_conversation_id and organization_id=p_organization_id for update;
 if not found then raise exception 'conversation_forbidden' using errcode='42501'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_conversation_id,p_expected_revision,'reassign',p_assignee_id)::text,'UTF8')),'hex');
 select * into receipt from public.conversation_transition_receipts where request_id=p_request_id;
 if found then
  if receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.fingerprint<>fingerprint then raise exception 'conversation_version_conflict' using errcode='40001'; end if;
  return receipt.result;
 end if;
 if c.revision<>p_expected_revision then raise exception 'conversation_version_conflict' using errcode='40001'; end if;
 if c.status!='STAFF_ACTIVE' then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 select * into h from public.conversation_handoffs where id=c.active_handoff_id;
 if h.claimed_by=p_assignee_id then raise exception 'invalid_handoff_transition' using errcode='22023'; end if;
 insert into public.conversation_handoff_assignments(handoff_id,previous_actor_id,previous_claimed_at,assigned_actor_id,manager_actor_id,request_id)
 values(h.id,h.claimed_by,h.claimed_at,p_assignee_id,p_actor_id,p_request_id);
 update public.conversation_handoffs set claimed_by=p_assignee_id,claimed_at=clock_timestamp() where id=h.id;
 update public.conversations set revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'conversation.handoff_reassigned','conversation',c.id,'manager_reassignment',p_request_id,p_request_id);
 result:=public.conversation_snapshot(c.id);
 insert into public.conversation_transition_receipts(request_id,organization_id,actor_id,fingerprint,result) values(p_request_id,p_organization_id,p_actor_id,fingerprint,result);
 return result;
end $$;
revoke all on function public.reassign_conversation_handoff(uuid,uuid,uuid,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reassign_conversation_handoff(uuid,uuid,uuid,integer,uuid,uuid) to service_role;
