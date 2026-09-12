-- SPDX-License-Identifier: Apache-2.0
-- Deliberately no payload, names, free-form reason, chat or credentials.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('staff','system')),
  -- Historical identity is retained even after an auth account is removed.
  actor_id uuid,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{0,63}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{0,47}$'),
  entity_id uuid not null,
  reason text not null check (reason ~ '^[a-z][a-z0-9_.]{0,63}$'),
  correlation_id uuid not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  check ((actor_kind = 'staff' and actor_id is not null) or (actor_kind = 'system' and actor_id is null))
);
create index audit_events_scope_time_idx on public.audit_events(organization_id,created_at desc,id desc);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public,anon,authenticated,service_role;
grant select,insert on public.audit_events to service_role;
create policy server_reads_audit on public.audit_events for select to service_role using (true);
create policy server_appends_audit on public.audit_events for insert to service_role with check (true);
create function public.reject_audit_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'audit events are append-only';
end;
$$;
revoke all on function public.reject_audit_mutation() from public,anon,authenticated,service_role;
create trigger audit_no_change before update or delete on public.audit_events for each row execute function public.reject_audit_mutation();
create trigger audit_no_truncate before truncate on public.audit_events for each statement execute function public.reject_audit_mutation();
