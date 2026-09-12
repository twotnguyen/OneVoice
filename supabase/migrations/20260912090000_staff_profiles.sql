-- SPDX-License-Identifier: Apache-2.0
-- One installation uses one configured organization. Existing catalog is retained.
create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  role text not null check (role in ('manager', 'staff')),
  active boolean not null default true,
  display_name text not null default '' check (char_length(display_name) <= 160),
  created_at timestamptz not null default now()
);

create index staff_profiles_organization_idx on public.staff_profiles (organization_id);
alter table public.staff_profiles enable row level security;

revoke all on public.staff_profiles from public, anon, authenticated;
grant select on public.staff_profiles to authenticated;
grant select, insert, update, delete on public.staff_profiles to service_role;

-- Browsers may inspect only their own active profile. Even a manager cannot
-- provision or change roles directly. Mutations go through the trusted server
-- with independently verified session/scope, permission and transactional audit.
create policy staff_reads_own_active_profile on public.staff_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) and active);

create policy server_manages_staff_profiles on public.staff_profiles
  for all to service_role using (true) with check (true);
