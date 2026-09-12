begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','update_staff_account',array['uuid','uuid','uuid','uuid','integer','text','text','boolean']);
insert into public.organizations(id,name,slug) values('a0000000-0000-0000-0000-000000000048','Staff test','staff-test-048');
insert into auth.users(id) values('f0000000-0000-4000-8000-000000000048'),('f0000000-0000-4000-8000-000000000049');
insert into public.staff_profiles(user_id,organization_id,role,display_name) values
('f0000000-0000-4000-8000-000000000048','a0000000-0000-0000-0000-000000000048','manager','Manager'),
('f0000000-0000-4000-8000-000000000049','a0000000-0000-0000-0000-000000000048','staff','Staff');
create function pg_temp.change_staff(actor uuid,target uuid,ver integer,role text,active boolean,req uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.update_staff_account('a0000000-0000-0000-0000-000000000048',actor,target,req,ver,'Test',role,active);
$$;
set local role service_role;
select throws_ok($$select pg_temp.change_staff('f0000000-0000-4000-8000-000000000049','f0000000-0000-4000-8000-000000000049',1,'manager',true)$$,'42501',null,'staff cannot promote');
select throws_ok($$select pg_temp.change_staff('f0000000-0000-4000-8000-000000000048','f0000000-0000-4000-8000-000000000048',1,'staff',true)$$,'23514',null,'last manager cannot demote');
select throws_ok($$select pg_temp.change_staff('f0000000-0000-4000-8000-000000000048','f0000000-0000-4000-8000-000000000048',1,'manager',false)$$,'23514',null,'last manager cannot disable');
select lives_ok($$select pg_temp.change_staff('f0000000-0000-4000-8000-000000000048','f0000000-0000-4000-8000-000000000049',1,'manager',true,'d0000000-0000-4000-8000-000000000048')$$,'promote another manager');
select lives_ok($$select pg_temp.change_staff('f0000000-0000-4000-8000-000000000048','f0000000-0000-4000-8000-000000000049',1,'manager',true,'d0000000-0000-4000-8000-000000000048')$$,'replay is idempotent');
select throws_ok($$select pg_temp.change_staff('f0000000-0000-4000-8000-000000000048','f0000000-0000-4000-8000-000000000049',1,'staff',true)$$,'40001',null,'stale version rejected');
select lives_ok($$select pg_temp.change_staff('f0000000-0000-4000-8000-000000000048','f0000000-0000-4000-8000-000000000048',1,'staff',true)$$,'self demote when another manager exists');
select is((select count(*)::integer from public.staff_profiles where organization_id='a0000000-0000-0000-0000-000000000048' and active and role='manager'),1,'one active manager remains');
select lives_ok($$select public.reserve_staff_account('a0000000-0000-0000-0000-000000000048','f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000050','new@example.invalid','New','staff',repeat('a',64))$$,'reserve new account without password storage');
select is((select count(*)::integer from public.staff_profiles where organization_id='a0000000-0000-0000-0000-000000000048'),2,'reservation grants no profile access');
select throws_ok($$select public.finish_staff_account('a0000000-0000-0000-0000-000000000048','f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000050')$$,'42501',null,'cannot finish without verified Auth identity');
reset role;
insert into auth.users(id,email,raw_app_meta_data) select user_id,'new@example.invalid',jsonb_build_object('onevoice_staff_marker',marker) from public.staff_admin_requests where request_id='d0000000-0000-4000-8000-000000000050';
insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key) values('a0000000-0000-0000-0000-000000000048','system','staff.test','staff_profile','f0000000-0000-4000-8000-000000000049','test','d0000000-0000-4000-8000-000000000050','d0000000-0000-4000-8000-000000000050');
set local role service_role;
select throws_ok($$select public.finish_staff_account('a0000000-0000-0000-0000-000000000048','f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000050')$$,'23505',null,'audit failure aborts profile completion');
select is((select count(*)::integer from public.staff_profiles where organization_id='a0000000-0000-0000-0000-000000000048'),2,'failed completion leaves Auth without access');
select ok((select completed_version is null from public.staff_admin_requests where request_id='d0000000-0000-4000-8000-000000000050'),'failed completion remains retryable');
select throws_ok($$select public.reserve_staff_account('a0000000-0000-0000-0000-000000000048','f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000050','new@example.invalid','New','staff',repeat('b',64))$$,'40001',null,'changed credential digest cannot reuse request');
select * from finish();
rollback;
