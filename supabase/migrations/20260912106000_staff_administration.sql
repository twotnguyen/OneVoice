-- SPDX-License-Identifier: Apache-2.0
alter table public.staff_profiles add column version integer not null default 1 check(version>0);
create table public.staff_admin_requests (
 request_id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 user_id uuid not null,
 action text not null check(action in('create','update')),
 document jsonb not null,
 marker uuid,
 completed_version integer,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.staff_admin_requests enable row level security;
revoke all on public.staff_admin_requests from public,anon,authenticated,service_role;
grant select on public.staff_admin_requests to service_role;

-- All administration takes this organization lock BEFORE profile locks, so two
-- managers cannot each demote the other based on an obsolete manager count.
create function public.reserve_staff_account(p_organization_id uuid,p_actor_id uuid,p_request_id uuid,p_email text,p_display_name text,p_role text,p_credential_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.staff_admin_requests; payload jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,480));
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for update;
 if not found then raise exception 'staff_forbidden' using errcode='42501'; end if;
 if p_request_id is null or p_email is null or char_length(p_email) not between 3 and 254 or p_email<>lower(p_email) or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_role is null or p_role not in('manager','staff') or p_display_name is null or char_length(trim(p_display_name)) not between 1 and 160 or p_credential_digest is null or p_credential_digest!~'^[a-f0-9]{64}$' then raise exception 'staff_invalid' using errcode='22023'; end if;
 payload:=jsonb_build_object('email',p_email,'displayName',p_display_name,'role',p_role,'credentialDigest',p_credential_digest);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,481));
 select * into receipt from public.staff_admin_requests where request_id=p_request_id;
 if found then
  if receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.action<>'create' or receipt.document<>payload then raise exception 'staff_conflict' using errcode='40001'; end if;
 else
  insert into public.staff_admin_requests(request_id,organization_id,actor_id,user_id,action,document,marker)
  values(p_request_id,p_organization_id,p_actor_id,gen_random_uuid(),'create',payload,gen_random_uuid()) returning * into receipt;
 end if;
 return jsonb_build_object('userId',receipt.user_id,'marker',receipt.marker,'completed',receipt.completed_version is not null);
end $$;

create function public.finish_staff_account(p_organization_id uuid,p_actor_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.staff_admin_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,480));
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for update;
 if not found then raise exception 'staff_forbidden' using errcode='42501'; end if;
 select * into receipt from public.staff_admin_requests where request_id=p_request_id for update;
 if not found or receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.action<>'create' then raise exception 'staff_forbidden' using errcode='42501'; end if;
 if receipt.completed_version is not null then return jsonb_build_object('userId',receipt.user_id,'version',receipt.completed_version); end if;
 perform 1 from auth.users where id=receipt.user_id and lower(email)=receipt.document->>'email' and raw_app_meta_data->>'onevoice_staff_marker'=receipt.marker::text for share;
 if not found then raise exception 'staff_identity_unverified' using errcode='42501'; end if;
 -- Never upsert/adopt an existing profile, even if the Auth identifier matches.
 insert into public.staff_profiles(user_id,organization_id,display_name,role,active) values(receipt.user_id,p_organization_id,receipt.document->>'displayName',receipt.document->>'role',true);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'staff.created','staff_profile',receipt.user_id,'manager_update',p_request_id,p_request_id);
 update public.staff_admin_requests set completed_version=1 where request_id=p_request_id;
 return jsonb_build_object('userId',receipt.user_id,'version',1);
end $$;

create function public.update_staff_account(p_organization_id uuid,p_actor_id uuid,p_user_id uuid,p_request_id uuid,p_expected_version integer,p_display_name text,p_role text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.staff_admin_requests; previous public.staff_profiles; payload jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,480));
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for update;
 if not found then raise exception 'staff_forbidden' using errcode='42501'; end if;
 if p_user_id is null or p_request_id is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 or p_active is null or p_role is null or p_role not in('manager','staff') or p_display_name is null or char_length(trim(p_display_name)) not between 1 and 160 then raise exception 'staff_invalid' using errcode='22023'; end if;
 payload:=jsonb_build_object('expectedVersion',p_expected_version,'displayName',p_display_name,'role',p_role,'active',p_active);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,481));
 select * into receipt from public.staff_admin_requests where request_id=p_request_id;
 if found then
  if receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.action<>'update' or receipt.user_id<>p_user_id or receipt.document<>payload then raise exception 'staff_conflict' using errcode='40001'; end if;
  return jsonb_build_object('userId',p_user_id,'version',receipt.completed_version);
 end if;
 select * into previous from public.staff_profiles where user_id=p_user_id and organization_id=p_organization_id for update;
 if not found then raise exception 'staff_forbidden' using errcode='42501'; end if;
 if previous.version<>p_expected_version then raise exception 'staff_conflict' using errcode='40001'; end if;
 if previous.active and previous.role='manager' and (not p_active or p_role<>'manager') and (select count(*) from public.staff_profiles where organization_id=p_organization_id and active and role='manager')<=1 then raise exception 'last_active_manager' using errcode='23514'; end if;
 update public.staff_profiles set display_name=p_display_name,role=p_role,active=p_active,version=version+1 where user_id=p_user_id;
 insert into public.staff_admin_requests(request_id,organization_id,actor_id,user_id,action,document,completed_version) values(p_request_id,p_organization_id,p_actor_id,p_user_id,'update',payload,p_expected_version+1);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'staff.updated','staff_profile',p_user_id,'manager_update',p_request_id,p_request_id);
 return jsonb_build_object('userId',p_user_id,'version',p_expected_version+1);
end $$;
revoke all on function public.reserve_staff_account(uuid,uuid,uuid,text,text,text,text),public.finish_staff_account(uuid,uuid,uuid),public.update_staff_account(uuid,uuid,uuid,uuid,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_staff_account(uuid,uuid,uuid,text,text,text,text),public.finish_staff_account(uuid,uuid,uuid),public.update_staff_account(uuid,uuid,uuid,uuid,integer,text,text,boolean) to service_role;
