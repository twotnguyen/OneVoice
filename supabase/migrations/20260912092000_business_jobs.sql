-- SPDX-License-Identifier: Apache-2.0
-- At-least-once, service-only outbox. Business RPCs can enqueue in their own transaction.
create table public.business_jobs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 kind text not null check (kind in ('inbound_event','outbound_message','automation_tick')),
 entity_id uuid not null,
 dedup_key uuid not null,
 scheduled_at timestamptz not null,
 available_at timestamptz not null,
 max_attempts integer not null check (max_attempts between 1 and 20),
 attempts integer not null default 0 check (attempts >= 0 and attempts <= max_attempts),
 status text not null default 'queued' check (status in ('queued','running','succeeded','dead')),
 lease_owner uuid,
 lease_token uuid,
 lease_expires_at timestamptz,
 attempt_started_at timestamptz,
 last_error text check (last_error in ('handler_failed','lease_expired','shutdown','unsupported_kind')),
 created_at timestamptz not null default now(),
 unique (organization_id,dedup_key),
 check ((status = 'running') = (lease_owner is not null and lease_token is not null and lease_expires_at is not null and attempt_started_at is not null))
);
create index business_jobs_claim_idx on public.business_jobs(available_at,id) where status in ('queued','running');
alter table public.business_jobs enable row level security;
revoke all on public.business_jobs from public,anon,authenticated,service_role;
grant select on public.business_jobs to service_role;
create policy business_jobs_service_read on public.business_jobs for select to service_role using (true);

create function public.enqueue_business_job(p_organization_id uuid,p_kind text,p_entity_id uuid,p_dedup_key uuid,p_available_at timestamptz,p_max_attempts integer default 5)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j public.business_jobs;
begin
 insert into public.business_jobs(organization_id,kind,entity_id,dedup_key,scheduled_at,available_at,max_attempts)
 values(p_organization_id,p_kind,p_entity_id,p_dedup_key,p_available_at,p_available_at,p_max_attempts)
 on conflict (organization_id,dedup_key) do nothing returning * into j;
 if j.id is null then
  select * into j from public.business_jobs where organization_id=p_organization_id and dedup_key=p_dedup_key;
  if (j.kind,j.entity_id,j.scheduled_at,j.max_attempts) is distinct from (p_kind,p_entity_id,p_available_at,p_max_attempts) then
   raise exception 'job_idempotency_conflict' using errcode='22023';
  end if;
 end if;
 return j.id;
end $$;

-- p_now is a trusted service clock injection seam; never exposed to browser roles.
create function public.claim_business_job(p_owner uuid,p_lease_seconds integer default 60,p_now timestamptz default clock_timestamp())
returns setof public.business_jobs language plpgsql security definer set search_path = '' as $$
declare j public.business_jobs;
begin
 if p_owner is null or p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_claim' using errcode='22023'; end if;
 -- Lock only eligible rows, skipping transactions held by other workers.
 for j in select * from public.business_jobs where
  (status='queued' and available_at<=p_now) or (status='running' and lease_expires_at<=p_now)
  order by available_at,id for update skip locked
 loop
  if j.attempts >= j.max_attempts then
   update public.business_jobs set status='dead',last_error='lease_expired',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null where id=j.id;
  else
   return query update public.business_jobs set status='running',attempts=attempts+1,lease_owner=p_owner,lease_token=gen_random_uuid(),lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_started_at=p_now,
    last_error=case when j.status='running' then 'lease_expired' else last_error end
    where id=j.id returning *;
   return;
  end if;
 end loop;
end $$;

create function public.heartbeat_business_job(p_id uuid,p_owner uuid,p_token uuid,p_lease_seconds integer default 60,p_now timestamptz default clock_timestamp())
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if p_now is null or p_lease_seconds is null or p_lease_seconds not between 5 and 300 then raise exception 'invalid_job_heartbeat' using errcode='22023'; end if;
 update public.business_jobs set lease_expires_at=least(p_now+make_interval(secs=>p_lease_seconds),attempt_started_at+interval '15 minutes')
 where id=p_id and status='running' and lease_owner=p_owner and lease_token=p_token and lease_expires_at>p_now and attempt_started_at+interval '15 minutes'>p_now;
 return found;
end $$;

create function public.finish_business_job(p_id uuid,p_owner uuid,p_token uuid,p_error text default null,p_now timestamptz default clock_timestamp())
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if p_now is null or (p_error is not null and p_error not in ('handler_failed','shutdown','unsupported_kind')) then raise exception 'invalid_job_outcome' using errcode='22023'; end if;
 update public.business_jobs set status=case when p_error is null then 'succeeded' when attempts>=max_attempts or p_error='unsupported_kind' then 'dead' else 'queued' end,
 available_at=case when p_error is null then available_at else p_now+make_interval(secs=>least(3600,5*power(2,attempts-1)::integer)) end,
 last_error=p_error,lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null
 where id=p_id and status='running' and lease_owner=p_owner and lease_token=p_token and lease_expires_at>p_now;
 return found;
end $$;
revoke all on function public.enqueue_business_job(uuid,text,uuid,uuid,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.claim_business_job(uuid,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.heartbeat_business_job(uuid,uuid,uuid,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_business_job(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_business_job(uuid,text,uuid,uuid,timestamptz,integer) to service_role;
grant execute on function public.claim_business_job(uuid,integer,timestamptz) to service_role;
grant execute on function public.heartbeat_business_job(uuid,uuid,uuid,integer,timestamptz) to service_role;
grant execute on function public.finish_business_job(uuid,uuid,uuid,text,timestamptz) to service_role;
