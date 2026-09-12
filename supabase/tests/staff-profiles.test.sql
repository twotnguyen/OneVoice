-- SPDX-License-Identifier: Apache-2.0
-- Local-only integration test: fixtures are rolled back, never use a remote DB.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'staff_profiles', 'staff profiles exist');
select ok((select relrowsecurity from pg_class where oid = 'public.staff_profiles'::regclass), 'RLS enabled');
select ok(not has_table_privilege('anon', 'public.staff_profiles', 'SELECT'), 'anon cannot read profiles');
select ok(not has_table_privilege('authenticated', 'public.staff_profiles', 'UPDATE'), 'users cannot promote themselves');
select ok(not has_table_privilege('authenticated', 'public.staff_profiles', 'INSERT'), 'users cannot provision themselves');
select ok(not has_table_privilege('authenticated', 'public.staff_profiles', 'DELETE'), 'users cannot delete profiles');

insert into auth.users (id) values
('b0000000-0000-4000-8000-000000000001'),
('b0000000-0000-4000-8000-000000000002'),
('b0000000-0000-4000-8000-000000000003');
insert into public.staff_profiles (user_id, organization_id, role, active) values
('b0000000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000001','manager',true),
('b0000000-0000-4000-8000-000000000002','a0000000-0000-0000-0000-000000000001','staff',true),
('b0000000-0000-4000-8000-000000000003','a0000000-0000-0000-0000-000000000001','staff',false);

set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.staff_profiles), 1::bigint, 'staff reads only own active profile');
select is((select role from public.staff_profiles), 'staff', 'staff has canonical role');
select throws_ok($$update public.staff_profiles set role='manager'$$, '42501', 'permission denied for table staff_profiles', 'self promotion blocked');
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.staff_profiles), 1::bigint, 'manager browser also only reads own profile');
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.staff_profiles), 0::bigint, 'disabled profile is not available');
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from public.staff_profiles), 0::bigint, 'missing identity reads no profile');
reset role;

select throws_ok($$update public.staff_profiles set role='admin' where user_id='b0000000-0000-4000-8000-000000000001'$$, '23514', null, 'unknown roles fail database validation');
set local role service_role;
select is((select count(*) from public.staff_profiles where user_id in ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000003')), 3::bigint, 'trusted server can manage staff');
select lives_ok($$update public.staff_profiles set active=false where user_id='b0000000-0000-4000-8000-000000000002'$$, 'trusted server can disable staff');
select lives_ok($$delete from public.staff_profiles where user_id='b0000000-0000-4000-8000-000000000002'$$, 'trusted server can remove profile');
select lives_ok($$insert into public.staff_profiles (user_id, organization_id, role) values ('b0000000-0000-4000-8000-000000000002','a0000000-0000-0000-0000-000000000001','staff')$$, 'trusted server can provision profile');
reset role;
select * from finish();
rollback;
