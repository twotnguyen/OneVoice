begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','save_knowledge_source',array['uuid','uuid','uuid','uuid','integer','jsonb']);
insert into public.organizations(id,name,slug) values('a0000000-0000-0000-0000-000000000049','Source test','source-test-049');
insert into auth.users(id) values('f0000000-0000-4000-8000-000000000049'),('f0000000-0000-4000-8000-000000000050');
insert into public.staff_profiles(user_id,organization_id,role) values
('f0000000-0000-4000-8000-000000000049','a0000000-0000-0000-0000-000000000049','manager'),
('f0000000-0000-4000-8000-000000000050','a0000000-0000-0000-0000-000000000049','staff');
create function pg_temp.save_source(actor uuid,req uuid,ver integer,changes jsonb default '{}') returns jsonb language sql as $$
 select public.save_knowledge_source('a0000000-0000-0000-0000-000000000049',actor,'e0000000-0000-4000-8000-000000000049',req,ver,
 '{"name":"Source test","kind":"text","text":"Business instructions as data","url":null,"authority":"business","productIds":[],"topics":[],"freshnessHours":24,"active":true}'::jsonb||changes);
$$;
select ok(not has_function_privilege('anon','public.save_knowledge_source(uuid,uuid,uuid,uuid,integer,jsonb)','execute'),'anonymous cannot call source mutation');
select ok(not has_table_privilege('authenticated','public.knowledge_sources','select'),'browser cannot bypass server source scope');
set local role service_role;
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000050','d0000000-0000-4000-8000-000000000049',0)$$,'42501',null,'staff cannot write');
select lives_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000049',0)$$,'manager saves source');
select is((select version from public.knowledge_sources where id='e0000000-0000-4000-8000-000000000049'),1,'first version');
select lives_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000049',0)$$,'identical replay accepted');
select is((select count(*)::integer from public.knowledge_source_versions where source_id='e0000000-0000-4000-8000-000000000049'),1,'replay no duplicate history');
select is((select count(*)::integer from public.audit_events where entity_id='e0000000-0000-4000-8000-000000000049'),1,'replay no duplicate audit');
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000051',0)$$,'40001',null,'stale revision cannot overwrite');
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000049',0,'{"active":false}')$$,'40001',null,'request key cannot change meaning');
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000051',1,'{"kind":"html","text":null,"url":"https://127.0.0.1/a"}')$$,'22023',null,'private literal rejected in RPC');
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000051',1,'{"freshnessHours":721}')$$,'22023',null,'freshness bounded');
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000051',1,'{"productIds":["e0000000-0000-4000-8000-000000000099"]}')$$,'22023',null,'unknown or foreign scoped product rejected');
select lives_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000052',1,'{"active":false}')$$,'soft disable saves new version');
select is((select document->>'active' from public.knowledge_sources where id='e0000000-0000-4000-8000-000000000049'),'false','disabled source retained');
select is((select count(*)::integer from public.knowledge_source_versions where source_id='e0000000-0000-4000-8000-000000000049'),2,'old versions retained');
reset role;
insert into public.audit_events(organization_id,actor_kind,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
values('a0000000-0000-0000-0000-000000000049','system','source.test','knowledge_source','e0000000-0000-4000-8000-000000000049','test','d0000000-0000-4000-8000-000000000053','d0000000-0000-4000-8000-000000000053');
set local role service_role;
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000053',2,'{"active":true}')$$,'23505',null,'audit failure aborts mutation');
select is((select version from public.knowledge_sources where id='e0000000-0000-4000-8000-000000000049'),2,'audit failure preserves current version');
reset role;
update public.staff_profiles set active=false where user_id='f0000000-0000-4000-8000-000000000049';
set local role service_role;
select throws_ok($$select pg_temp.save_source('f0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000049',0)$$,'42501',null,'disabled manager cannot replay');
reset role;
select * from finish();
rollback;
