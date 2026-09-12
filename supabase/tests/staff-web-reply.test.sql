-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into public.organizations(id,name,slug) values
 ('a0590000-0000-4000-8000-000000000001','OV-059 web','ov059-staff-web-reply'),
 ('a0590000-0000-4000-8000-000000000002','OV-059 other','ov059-staff-web-other');
insert into auth.users(id) values
 ('b0590000-0000-4000-8000-000000000001'),
 ('b0590000-0000-4000-8000-000000000002'),
 ('b0590000-0000-4000-8000-000000000003'),
 ('b0590000-0000-4000-8000-000000000004'),
 ('b0590000-0000-4000-8000-000000000005');
insert into public.staff_profiles(user_id,organization_id,role,active) values
 ('b0590000-0000-4000-8000-000000000001','a0590000-0000-4000-8000-000000000001','staff',true),
 ('b0590000-0000-4000-8000-000000000002','a0590000-0000-4000-8000-000000000001','staff',true),
 ('b0590000-0000-4000-8000-000000000003','a0590000-0000-4000-8000-000000000001','manager',true),
 ('b0590000-0000-4000-8000-000000000004','a0590000-0000-4000-8000-000000000001','staff',false),
 ('b0590000-0000-4000-8000-000000000005','a0590000-0000-4000-8000-000000000002','staff',true);

select has_function('public','staff_web_reply',array['uuid','uuid','uuid','integer','uuid','text'],'staff WEB reply RPC exists');
select ok(not has_function_privilege('authenticated','public.staff_web_reply(uuid,uuid,uuid,integer,uuid,text)','execute'),'browser cannot staff reply');
select ok(not has_table_privilege('service_role','public.web_outbound','insert'),'service still cannot bypass RPC insert');
select ok((select attnotnull=false from pg_attribute where attrelid='public.web_outbound'::regclass and attname='inbound_event_id'),'inbound_event_id nullable for staff replies');

-- WEB conversation claimed by staff 1.
create temporary table web059 as select public.ingest_web_event('a0590000-0000-4000-8000-000000000001','{"providerKey":"message:ov059-01","senderKey":"web-user-059","kind":"message","eventTimeMs":1700000000000,"data":{"text":"can nhan vien"}}') id;
select public.project_web_conversation('a0590000-0000-4000-8000-000000000001',id) from web059;
select public.request_conversation_handoff('a0590000-0000-4000-8000-000000000001',(select id from web059),0,'customer_requested');
create temporary table convo059 as select id,revision from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059';

set local role authenticated;
select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001','c0590000-0000-4000-8000-0000000000aa',1,'c0590000-0000-4000-8000-000000000099','leak')$$,'42501',null,'browser cannot execute staff_web_reply');
reset role;

select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059'),1,'c0590000-0000-4000-8000-000000000010','chua claim')$$,'22023','invalid_handoff_transition','AT-059 reply before claim rejected');

-- AT-059-04 concurrent claim: one winner.
select is(public.transition_conversation_handoff('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from convo059),1,'claim','c0590000-0000-4000-8000-000000000001')->>'status','STAFF_ACTIVE','first staff claims');
select throws_ok($$select public.transition_conversation_handoff('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000002',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059'),1,'claim','c0590000-0000-4000-8000-000000000002')$$,'40001','conversation_version_conflict','AT-059-04 second claimant loses CAS');
select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000002',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059'),2,'c0590000-0000-4000-8000-000000000003','loser reply')$$,'42501','conversation_forbidden','AT-059-04 loser cannot reply');

-- AT-059-01 staff reply persists VISIBLE web_outbound, audited, no messenger_outbox, does not complete.
select is(public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from convo059),2,'c0590000-0000-4000-8000-000000000004','Xin chao tu nhan vien')->>'kind','reply','AT-059-01 staff reply kind');
select is((select status from public.web_outbound where request_key='c0590000-0000-4000-8000-000000000004'),'VISIBLE','AT-059-01 VISIBLE immediately');
select is((select kind from public.web_outbound where request_key='c0590000-0000-4000-8000-000000000004'),'reply','kind reply for public GET');
select is((select inbound_event_id from public.web_outbound where request_key='c0590000-0000-4000-8000-000000000004'),null,'staff reply has no inbound event');
select is((select count(*) from public.messenger_outbox where organization_id='a0590000-0000-4000-8000-000000000001'),0::bigint,'AT-059-01 no messenger_outbox');
select is((select count(*) from public.audit_events where idempotency_key='c0590000-0000-4000-8000-000000000004' and action='conversation.staff_replied'),1::bigint,'AT-059-01 audit row');
select is((select status from public.conversations where id=(select id from convo059)),'STAFF_ACTIVE','reply does not complete');
select is((select revision from public.conversations where id=(select id from convo059)),2,'reply does not bump revision');
select is(public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from convo059),2,'c0590000-0000-4000-8000-000000000004','Xin chao tu nhan vien')->>'kind','reply','idempotent retry');
select is((select count(*) from public.web_outbound where conversation_id=(select id from convo059) and status='VISIBLE'),1::bigint,'retry does not duplicate outbound');
select is((select count(*) from public.audit_events where idempotency_key='c0590000-0000-4000-8000-000000000004'),1::bigint,'retry does not duplicate audit');

select is(public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000003',(select id from convo059),2,'c0590000-0000-4000-8000-000000000005','Manager ho tro')->>'kind','reply','manager may reply for claimant');
select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059'),2,'c0590000-0000-4000-8000-000000000006','')$$,'22023','invalid_handoff_transition','empty text rejected');
select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000004',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059'),2,'c0590000-0000-4000-8000-000000000007','inactive')$$,'42501','conversation_forbidden','AT-059-02 inactive session rejected');
select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000002','b0590000-0000-4000-8000-000000000005',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059'),2,'c0590000-0000-4000-8000-000000000008','cross org')$$,'42501','conversation_forbidden','AT-059-02 cross-org rejected');

-- AT-059-04 complete-only, no silent reopen via reply.
select is(public.transition_conversation_handoff('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from convo059),2,'complete','c0590000-0000-4000-8000-000000000009')->>'status','AI_ACTIVE','complete only');
select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-059'),3,'c0590000-0000-4000-8000-00000000000a','reopen')$$,'22023','invalid_handoff_transition','reply cannot reopen completed handoff');
select is((select status from public.conversations where id=(select id from convo059)),'AI_ACTIVE','complete stays complete');

-- AT-059-03 Facebook conversation rejects staff reply; no Graph/outbox from this RPC.
select public.ingest_facebook_events('a0590000-0000-4000-8000-000000000001','10000005901','[{"pageId":"10000005901","providerKey":"message:ov059-fb","kind":"message","senderId":"20000005901","recipientId":"10000005901","eventTimeMs":1700000001000,"data":{"text":"facebook"}}]');
select public.project_facebook_conversation('a0590000-0000-4000-8000-000000000001',id) from public.facebook_inbound_events where organization_id='a0590000-0000-4000-8000-000000000001' and provider_key='message:ov059-fb';
select public.request_conversation_handoff('a0590000-0000-4000-8000-000000000001',id,0,'customer_requested') from public.facebook_inbound_events where provider_key='message:ov059-fb';
create temporary table fb059 as select id,revision from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='FACEBOOK' and psid='20000005901';
select public.transition_conversation_handoff('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from fb059),(select revision from fb059),'claim','c0590000-0000-4000-8000-00000000000b');
select throws_ok($$select public.staff_web_reply('a0590000-0000-4000-8000-000000000001','b0590000-0000-4000-8000-000000000001',(select id from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='FACEBOOK' and psid='20000005901'),(select revision from public.conversations where organization_id='a0590000-0000-4000-8000-000000000001' and channel='FACEBOOK' and psid='20000005901'),'c0590000-0000-4000-8000-00000000000c','graph')$$,'22023','invalid_handoff_transition','AT-059-03 Facebook POST reply rejected');
select is((select count(*) from public.web_outbound where conversation_id=(select id from fb059)),0::bigint,'AT-059-03 no web outbound for Facebook');
select is((select count(*) from public.messenger_outbox where conversation_id=(select id from fb059)),0::bigint,'AT-059-03 staff reply never Graph/outbox');

select * from finish();
rollback;
