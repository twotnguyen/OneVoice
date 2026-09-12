begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_table('public','knowledge_gaps','gap storage exists');
insert into public.organizations(id,name,slug) values('a4500000-0000-4000-8000-000000000001','Gap fixture','gap-045');
insert into auth.users(id) values('b4500000-0000-4000-8000-000000000001'),('b4500000-0000-4000-8000-000000000002');
insert into public.staff_profiles(user_id,organization_id,role) values
 ('b4500000-0000-4000-8000-000000000001','a4500000-0000-4000-8000-000000000001','manager'),
 ('b4500000-0000-4000-8000-000000000002','a4500000-0000-4000-8000-000000000001','staff');
select public.ingest_facebook_events('a4500000-0000-4000-8000-000000000001','10000000045','[
 {"pageId":"10000000045","providerKey":"message:gap1","kind":"message","senderId":"20000000045","recipientId":"10000000045","data":{"text":"PRIVATE CUSTOMER QUESTION"}},
 {"pageId":"10000000045","providerKey":"message:gap2","kind":"message","senderId":"20000000045","recipientId":"10000000045","data":{"text":"OTHER PRIVATE QUESTION"}}
]');
create function pg_temp.record_gap(key text,rev integer default 0,field text default 'compatibility') returns jsonb language sql as $$
 select public.record_knowledge_gap('a4500000-0000-4000-8000-000000000001',id,rev,null,field,'missing_evidence') from public.facebook_inbound_events where page_id='10000000045' and provider_key=key
$$;
set local role service_role;
select lives_ok($$select pg_temp.record_gap('message:gap1')$$,'record and handoff succeed');
select is((select status from public.conversations where page_id='10000000045'),'WAITING_STAFF','record atomically pauses AI');
select is((select count(*) from public.knowledge_gap_occurrences where organization_id='a4500000-0000-4000-8000-000000000001'),1::bigint,'one occurrence');
select lives_ok($$select pg_temp.record_gap('message:gap1')$$,'replay succeeds');
select is((select count(*) from public.knowledge_gap_occurrences where organization_id='a4500000-0000-4000-8000-000000000001'),1::bigint,'replay deduped');
select lives_ok($$select pg_temp.record_gap('message:gap2',1)$$,'equivalent question adds occurrence');
select is((select count(*) from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001'),1::bigint,'same field/entity groups questions');
select is((select version from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001'),2,'version tracks occurrences');
select ok((select row_to_json(g)::text from public.knowledge_gaps g where organization_id='a4500000-0000-4000-8000-000000000001') not like '%PRIVATE%','gap contains no customer text');
select throws_ok($$select pg_temp.record_gap('message:gap1',0,'customer-phone')$$,'22023','GAP_INVALID','arbitrary fields rejected');
reset role;
create function pg_temp.resolve_gap(actor uuid default 'b4500000-0000-4000-8000-000000000001',ver integer default 2,req uuid default 'c4500000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.resolve_knowledge_gap('a4500000-0000-4000-8000-000000000001',actor,id,ver,req) from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001'
$$;
set local role service_role;
select throws_ok($$select pg_temp.resolve_gap('b4500000-0000-4000-8000-000000000002')$$,'42501','GAP_FORBIDDEN','staff cannot resolve');
select lives_ok($$select pg_temp.resolve_gap()$$,'manager resolves');
select lives_ok($$select pg_temp.resolve_gap()$$,'resolution retry deduped');
select is((select status from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001'),'RESOLVED','resolved persisted');
select is((select status from public.conversations where page_id='10000000045'),'WAITING_STAFF','resolve never resumes AI');
select lives_ok($$select pg_temp.record_gap('message:gap1')$$,'old occurrence replay after resolve');
select is((select status from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001'),'RESOLVED','old occurrence does not reopen');
select throws_ok($$select pg_temp.resolve_gap('b4500000-0000-4000-8000-000000000001',2,gen_random_uuid())$$,'40001','GAP_CONFLICT','stale resolution rejected');
select throws_ok($$select public.read_knowledge_gaps('a4500000-0000-4000-8000-000000000001','b4500000-0000-4000-8000-000000000002','OPEN',1)$$,'42501','GAP_FORBIDDEN','staff cannot read manager gaps');
select is(public.read_knowledge_gaps('a4500000-0000-4000-8000-000000000001','b4500000-0000-4000-8000-000000000001','RESOLVED',1)->>'total','1','manager reads scoped list');
select throws_ok($$select public.record_knowledge_gap(gen_random_uuid(),(select id from public.facebook_inbound_events where page_id='10000000045' and provider_key='message:gap1'),0,null,'price','missing_evidence')$$,'22023','conversation_event_missing','foreign event fails closed');
select public.ingest_facebook_events('a4500000-0000-4000-8000-000000000001','10000000045','[
 {"pageId":"10000000045","providerKey":"message:gap3","kind":"message","senderId":"20000000045","recipientId":"10000000045","data":{"text":"THIRD PRIVATE QUESTION"}},
 {"pageId":"10000000045","providerKey":"message:gap4","kind":"message","senderId":"20000000046","recipientId":"10000000045","data":{"text":"ROLLBACK FIXTURE"}},
 {"pageId":"10000000045","providerKey":"message:gap-old","kind":"message","senderId":"20000000045","recipientId":"10000000045","data":{"text":"DELAYED FIXTURE"}}
]');
select lives_ok($$select pg_temp.record_gap('message:gap3',1)$$,'new occurrence reopens resolved gap');
select is((select status from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001'),'OPEN','new missing fact is visible again');
select is((select count(*) from public.knowledge_gap_resolutions where organization_id='a4500000-0000-4000-8000-000000000001'),1::bigint,'previous resolution history retained');
select public.transition_conversation_handoff('a4500000-0000-4000-8000-000000000001','b4500000-0000-4000-8000-000000000001',id,1,'claim',gen_random_uuid()) from public.conversations where page_id='10000000045' and psid='20000000045';
select public.transition_conversation_handoff('a4500000-0000-4000-8000-000000000001','b4500000-0000-4000-8000-000000000001',id,2,'complete',gen_random_uuid()) from public.conversations where page_id='10000000045' and psid='20000000045';
select is(pg_temp.record_gap('message:gap-old',3)->>'ignored','true','delayed pre-completion input does not create new gap or handoff');
select is(pg_temp.record_gap('message:gap1',0,'specification')->>'ignored','true','changed classification of completed old event cannot create a new gap');
select is((select count(*) from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001' and field='specification'),0::bigint,'completed old event has no new occurrence');
reset role;
create function pg_temp.reject_gap_audit() returns trigger language plpgsql as $$begin if new.action='knowledge.gap_recorded' then raise exception 'gap_audit_failure'; end if; return new; end$$;
create trigger gap_audit_fixture before insert on public.audit_events for each row execute function pg_temp.reject_gap_audit();
select throws_ok($$select pg_temp.record_gap('message:gap4',0,'price')$$,'P0001','gap_audit_failure','failed gap audit rolls back entire handoff');
select is((select count(*) from public.conversations where page_id='10000000045' and psid='20000000046'),0::bigint,'failed gap leaves no projected conversation/handoff');
select is((select count(*) from public.knowledge_gaps where organization_id='a4500000-0000-4000-8000-000000000001' and field='price'),0::bigint,'failed gap leaves no record');
select ok(not has_table_privilege('authenticated','public.knowledge_gaps','SELECT'),'direct browser read denied');
select ok(not has_table_privilege('service_role','public.knowledge_gaps','UPDATE'),'service direct changes denied');
select throws_ok($$update public.knowledge_gap_resolutions set version=9 where organization_id='a4500000-0000-4000-8000-000000000001'$$,'55000',null,'resolution history immutable');
select * from finish();
rollback;
