-- SPDX-License-Identifier: Apache-2.0
create function public.valid_business_settings(s jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare w jsonb; t jsonb; previous_end text := ''; key_count integer;
begin
 if jsonb_typeof(s) <> 'object' then return false; end if;
 select count(*) into key_count from jsonb_object_keys(s);
 if key_count<>11 or not s ?& array['brandName','brandVoice','allowedTopics','forbiddenTopics','timezone','goalSelection','managerGoal','timingMode','dailyCap','windows','objective'] then return false; end if;
 if jsonb_typeof(s->'brandName')<>'string' or length(btrim(s->>'brandName')) not between 1 and 120 or jsonb_typeof(s->'brandVoice')<>'string' or length(btrim(s->>'brandVoice')) not between 1 and 2000 then return false; end if;
 if jsonb_typeof(s->'managerGoal')<>'string' or length(s->>'managerGoal')>1000 or s->>'goalSelection' not in ('auto','manager') or (s->>'goalSelection'='manager' and length(btrim(s->>'managerGoal'))=0) then return false; end if;
 if jsonb_typeof(s->'goalSelection')<>'string' or jsonb_typeof(s->'timingMode')<>'string' or jsonb_typeof(s->'objective')<>'string' or s->>'timingMode' not in ('auto','constrained') or s->>'objective' not in ('engagement','messages','paid-orders','mixed') then return false; end if;
 if jsonb_typeof(s->'dailyCap')<>'number' or s->>'dailyCap' !~ '^([1-9]|[12][0-9]|30)$' then return false; end if;
 if jsonb_typeof(s->'timezone')<>'string' or not exists(select 1 from pg_catalog.pg_timezone_names where name=s->>'timezone') then return false; end if;
 foreach t in array array[s->'allowedTopics',s->'forbiddenTopics'] loop
  if jsonb_typeof(t)<>'array' or jsonb_array_length(t)>30 then return false; end if;
  if exists(select 1 from jsonb_array_elements(t) v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 120) then return false; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements_text(s->'allowedTopics') a join jsonb_array_elements_text(s->'forbiddenTopics') f on lower(btrim(a.value))=lower(btrim(f.value))) then return false; end if;
 if jsonb_typeof(s->'windows')<>'array' or jsonb_array_length(s->'windows') not between 1 and 7 then return false; end if;
 for w in select value from jsonb_array_elements(s->'windows') order by value->>'start' loop
  if jsonb_typeof(w)<>'object' or (select count(*) from jsonb_object_keys(w))<>2 or not w ?& array['start','end'] or jsonb_typeof(w->'start')<>'string' or jsonb_typeof(w->'end')<>'string' then return false; end if;
  if w->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or w->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or w->>'start'>=w->>'end' or w->>'start'<previous_end then return false; end if;
  previous_end := w->>'end';
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function public.valid_business_settings(jsonb) from public,anon,authenticated;

create table public.business_settings (
 organization_id uuid primary key references public.organizations(id),
 revision integer not null check(revision>0),
 settings jsonb not null check(public.valid_business_settings(settings)),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.business_settings_requests (
 request_id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 actor_id uuid not null,
 input_hash text not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.business_settings enable row level security;
alter table public.business_settings_requests enable row level security;
revoke all on public.business_settings,public.business_settings_requests from public,anon,authenticated,service_role;
grant select on public.business_settings to service_role;
create policy server_reads_settings on public.business_settings for select to service_role using(true);

create function public.save_business_settings(p_organization_id uuid,p_actor_id uuid,p_expected_revision integer,p_request_id uuid,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row public.business_settings; receipt public.business_settings_requests; result jsonb; fingerprint text;
begin
 -- Hold the authorization row against concurrent disable/demotion until commit.
 perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
 if not found then raise exception 'settings_forbidden' using errcode='42501'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_settings is null or not public.valid_business_settings(p_settings) then raise exception 'invalid_settings' using errcode='22023'; end if;
 -- The existing installation row also serializes the initial revision-zero save.
 perform 1 from public.organizations where id=p_organization_id for update;
 fingerprint := encode(sha256(convert_to(jsonb_build_object('actor',p_actor_id,'revision',p_expected_revision,'settings',p_settings)::text,'UTF8')),'hex');
 select * into receipt from public.business_settings_requests where request_id=p_request_id;
 if found then
  if receipt.organization_id<>p_organization_id or receipt.actor_id<>p_actor_id or receipt.input_hash<>fingerprint then raise exception 'settings_version_conflict' using errcode='40001'; end if;
  return receipt.result;
 end if;
 select * into current_row from public.business_settings where organization_id=p_organization_id;
 if coalesce(current_row.revision,0)<>p_expected_revision then raise exception 'settings_version_conflict' using errcode='40001'; end if;
 insert into public.business_settings(organization_id,revision,settings) values(p_organization_id,p_expected_revision+1,p_settings)
 on conflict(organization_id) do update set revision=excluded.revision,settings=excluded.settings,updated_at=clock_timestamp();
 result := jsonb_build_object('revision',p_expected_revision+1,'settings',p_settings);
 insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
 values(p_organization_id,'staff',p_actor_id,'business.settings_updated','business_settings',p_organization_id,'manager_update',p_request_id,p_request_id);
 insert into public.business_settings_requests(request_id,organization_id,actor_id,input_hash,result) values(p_request_id,p_organization_id,p_actor_id,fingerprint,result);
 return result;
end $$;
revoke all on function public.save_business_settings(uuid,uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_business_settings(uuid,uuid,integer,uuid,jsonb) to service_role;
