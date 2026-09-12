-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into public.organizations(id,name,slug) values('a0540000-0000-4000-8000-000000000001','OV-054 fixture','ov054-channel-neutral'),('a0540000-0000-4000-8000-000000000002','OV-054 claim fixture','ov054-channel-neutral-claim');
insert into auth.users(id) values('b0540000-0000-4000-8000-000000000001'),('b0540000-0000-4000-8000-000000000002');
insert into public.staff_profiles(user_id,organization_id,role) values
('b0540000-0000-4000-8000-000000000001','a0540000-0000-4000-8000-000000000001','staff'),
('b0540000-0000-4000-8000-000000000002','a0540000-0000-4000-8000-000000000001','manager');

select has_table('public','web_inbound_events','AT-054 web inbound table exists');
select has_function('public','project_web_conversation',array['uuid','uuid'],'AT-054 web projection exists');
select has_function('public','ingest_web_event',array['uuid','jsonb'],'AT-054 web ingest enqueues inbound jobs');
select ok(not has_table_privilege('authenticated','public.web_inbound_events','SELECT'),'browser cannot read web inbound');
select ok(not has_table_privilege('service_role','public.web_inbound_events','INSERT'),'service must use ingest RPC');
select ok(not has_function_privilege('authenticated','public.project_web_conversation(uuid,uuid)','EXECUTE'),'browser cannot project web conversations');

-- AT-054-01 Facebook regression: two Pages, same PSID, replay, echo/comment ignored.
select public.ingest_facebook_events('a0540000-0000-4000-8000-000000000001','10000000054','[
 {"pageId":"10000000054","providerKey":"message:ov054-a","kind":"message","senderId":"20000000054","recipientId":"10000000054","eventTimeMs":1700000000000,"data":{"text":"page a"}},
 {"pageId":"10000000054","providerKey":"echo:ov054","kind":"echo","senderId":"10000000054","recipientId":"20000000054","data":{"text":"echo"}},
 {"pageId":"10000000054","providerKey":"comment:ov054","kind":"comment","senderId":"20000000054","recipientId":"10000000054","data":{"text":"public"}}
]');
select public.ingest_facebook_events('a0540000-0000-4000-8000-000000000001','10000000055','[
 {"pageId":"10000000055","providerKey":"message:ov054-b","kind":"message","senderId":"20000000054","recipientId":"10000000055","eventTimeMs":1700000000000,"data":{"text":"page b"}}
]');
create temporary table fb_a as select id from public.facebook_inbound_events where organization_id='a0540000-0000-4000-8000-000000000001' and page_id='10000000054' and provider_key='message:ov054-a';
create temporary table fb_b as select id from public.facebook_inbound_events where organization_id='a0540000-0000-4000-8000-000000000001' and page_id='10000000055' and provider_key='message:ov054-b';
grant select on fb_a,fb_b to service_role;
set local role service_role;
create temporary table proj_a as select public.project_facebook_conversation('a0540000-0000-4000-8000-000000000001',id) result from fb_a;
create temporary table proj_b as select public.project_facebook_conversation('a0540000-0000-4000-8000-000000000001',id) result from fb_b;
select is((select result->>'inserted' from proj_a),'true','AT-054-01 first page projected');
select is((select result->>'inserted' from proj_b),'true','AT-054-01 second page projected');
select is(public.project_facebook_conversation('a0540000-0000-4000-8000-000000000001',id)->>'inserted','false','AT-054-01 replay inserted=false') from fb_a;
select is((select count(*) from public.conversations where organization_id='a0540000-0000-4000-8000-000000000001' and channel='FACEBOOK' and psid='20000000054'),2::bigint,'AT-054-01 two Pages same PSID stay two rows');
select is((select result->'conversation'->>'channel' from proj_a),'FACEBOOK','AT-054-01 facebook channel');
select is((select result->'conversation'->>'channelUserKey' from proj_a),'20000000054','AT-054-01 facebook channel_user_key is PSID');
select is(public.project_facebook_conversation('a0540000-0000-4000-8000-000000000001',id)->>'ignored','true','AT-054-01 echo ignored') from public.facebook_inbound_events where page_id='10000000054' and kind='echo';
select is(public.project_facebook_conversation('a0540000-0000-4000-8000-000000000001',id)->>'ignored','true','AT-054-01 comment ignored') from public.facebook_inbound_events where page_id='10000000054' and kind='comment';
reset role;

-- AT-054-02 WEB without page_id/psid.
set local role service_role;
create temporary table web_first as select public.ingest_web_event('a0540000-0000-4000-8000-000000000001','{"providerKey":"message:ov054-web-1","senderKey":"web-user-054","kind":"message","eventTimeMs":1700000001000,"data":{"text":"web hello"}}') id;
create temporary table proj_web as select public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id) result from web_first;
select is((select result->>'inserted' from proj_web),'true','AT-054-02 web conversation inserted');
select is((select result->'conversation'->>'channel' from proj_web),'WEB','AT-054-02 channel=WEB');
select is((select result->'conversation'->>'channelUserKey' from proj_web),'web-user-054','AT-054-02 channel_user_key');
select ok((select result->'conversation'->'pageId' from proj_web) = 'null'::jsonb,'AT-054-02 pageId is null');
select ok((select result->'conversation'->'psid' from proj_web) = 'null'::jsonb,'AT-054-02 psid is null');
select is((select page_id from public.conversations where id=(select (result->'conversation'->>'id')::uuid from proj_web)),null,'AT-054-02 stored page_id null');
select is((select psid from public.conversations where id=(select (result->'conversation'->>'id')::uuid from proj_web)),null,'AT-054-02 stored psid null');
select is((select facebook_inbound_event_id from public.conversation_messages where inbound_event_id=(select id from web_first)),null,'AT-054-02 web message has no facebook inbound FK');
select is((select web_inbound_event_id from public.conversation_messages where inbound_event_id=(select id from web_first)),(select id from web_first),'AT-054-02 web inbound pointer');
reset role;
select throws_ok($$insert into public.conversations(organization_id,channel,channel_user_key,page_id,psid) values('a0540000-0000-4000-8000-000000000001','WEB','bad-web','10000000054','20000000054')$$,'23514',null,'AT-054-02 CHECK forbids WEB page/psid');
select throws_ok($$insert into public.conversations(organization_id,channel,channel_user_key) values('a0540000-0000-4000-8000-000000000001','FACEBOOK','missing-page')$$,'23514',null,'AT-054-02 FACEBOOK still requires page/psid');
select throws_ok($$insert into public.conversations(organization_id,channel,channel_user_key) values('a0540000-0000-4000-8000-000000000001','WEB','')$$,'23514',null,'AT-054-02 empty channel_user_key rejected');

-- AT-054-03 uniqueness.
set local role service_role;
select is(public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id)->>'inserted','false','AT-054-03 replay same web event') from web_first;
create temporary table web_dup as select public.ingest_web_event('a0540000-0000-4000-8000-000000000001','{"providerKey":"message:ov054-web-1","senderKey":"web-user-054","kind":"message","eventTimeMs":1700000001000,"data":{"text":"web hello"}}') id;
select is((select id from web_dup),(select id from web_first),'AT-054-03 duplicate provider_key returns same event');
select is((select count(*) from public.web_inbound_events where organization_id='a0540000-0000-4000-8000-000000000001' and provider_key='message:ov054-web-1'),1::bigint,'AT-054-03 one inbound row');
select is((select count(*) from public.conversation_messages where conversation_id=(select (result->'conversation'->>'id')::uuid from proj_web)),1::bigint,'AT-054-03 duplicate inbound does not duplicate messages');
create temporary table web_second as select public.ingest_web_event('a0540000-0000-4000-8000-000000000001','{"providerKey":"message:ov054-web-2","senderKey":"web-user-054","kind":"message","eventTimeMs":1700000002000,"data":{"text":"same user"}}') id;
select is(public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id)->'conversation'->>'id',(select result->'conversation'->>'id' from proj_web),'AT-054-03 same web key is one conversation') from web_second;
select is((select count(*) from public.conversations where organization_id='a0540000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='web-user-054'),1::bigint,'AT-054-03 one WEB row');
create temporary table web_same_psid as select public.ingest_web_event('a0540000-0000-4000-8000-000000000001','{"providerKey":"message:ov054-web-psid","senderKey":"20000000054","kind":"message","eventTimeMs":1700000003000,"data":{"text":"same key string"}}') id;
select is(public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id)->>'inserted','true','AT-054-03 web with facebook PSID string inserts') from web_same_psid;
select ok((select count(*) from public.conversations where organization_id='a0540000-0000-4000-8000-000000000001' and channel='WEB' and channel_user_key='20000000054')=1 and (select count(*) from public.conversations where organization_id='a0540000-0000-4000-8000-000000000001' and channel='FACEBOOK' and psid='20000000054')=2,'AT-054-03 WEB and FACEBOOK same key stay two identities');
reset role;

-- Consultation claim: WEB inbound is private; comments stay unclaimed by consultation.
set local role service_role;
create temporary table web_claim_first as select public.ingest_web_event('a0540000-0000-4000-8000-000000000002','{"providerKey":"message:ov054-claim-a","senderKey":"web-claim-054","kind":"message","eventTimeMs":1700000005000,"data":{"text":"claim a"}}') id;
create temporary table web_claim_second as select public.ingest_web_event('a0540000-0000-4000-8000-000000000002','{"providerKey":"message:ov054-claim-b","senderKey":"web-claim-054","kind":"message","eventTimeMs":1700000006000,"data":{"text":"claim b"}}') id;
create temporary table web_claim as select public.claim_consultation_job('d0540000-0000-4000-8000-000000000001','a0540000-0000-4000-8000-000000000002') value;
select ok((select value is not null from web_claim),'claim_consultation_job claims web inbound');
select is((select value#>>'{job,entity_id}' from web_claim),(select id::text from web_claim_first),'consultation claims earliest web message');
reset role;
select is((select status from public.business_jobs where entity_id=(select id from web_claim_second)),'queued','later web job waits on serialized consultation');
select ok(not exists(select 1 from public.claim_business_job('d0540000-0000-4000-8000-000000000009') b join public.web_inbound_events e on e.id=b.entity_id where e.organization_id='a0540000-0000-4000-8000-000000000002'),'generic claimant cannot steal web inbound');
select ok(not exists(select 1 from public.claim_consultation_job('d0540000-0000-4000-8000-000000000008','a0540000-0000-4000-8000-000000000002') c join public.facebook_inbound_events e on e.id=(c#>>'{job,entity_id}')::uuid where e.kind='comment'),'consultation does not claim comments');

-- AT-054-04 suppression WAITING_STAFF (OV-014 contract).
set local role service_role;
create temporary table web_pause as select public.ingest_web_event('a0540000-0000-4000-8000-000000000001','{"providerKey":"message:ov054-pause","senderKey":"web-pause-054","kind":"message","eventTimeMs":1800000000000,"data":{"text":"need staff"}}') id;
create temporary table proj_pause as select public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id) result from web_pause;
select is((select result->>'aiEligible' from proj_pause),'true','AT-054-04 fresh web is eligible');
select is(public.request_conversation_handoff('a0540000-0000-4000-8000-000000000001',id,0,'customer_requested')->>'status','WAITING_STAFF','AT-054-04 web handoff pauses') from web_pause;
create temporary table web_during as select public.ingest_web_event('a0540000-0000-4000-8000-000000000001','{"providerKey":"message:ov054-during","senderKey":"web-pause-054","kind":"message","eventTimeMs":1800000001000,"data":{"text":"during pause"}}') id;
select is(public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id)->>'aiEligible','false','AT-054-04 inbound during pause saved but suppressed') from web_during;
select is((select count(*) from public.conversation_messages where conversation_id=(select (result->'conversation'->>'id')::uuid from proj_pause)),2::bigint,'AT-054-04 pause inbound persisted');
select is(public.transition_conversation_handoff('a0540000-0000-4000-8000-000000000001','b0540000-0000-4000-8000-000000000001',(result->'conversation'->>'id')::uuid,1,'claim','c0540000-0000-4000-8000-000000000001')->>'status','STAFF_ACTIVE','AT-054-04 staff claim') from proj_pause;
select is(public.transition_conversation_handoff('a0540000-0000-4000-8000-000000000001','b0540000-0000-4000-8000-000000000002',(select (result->'conversation'->>'id')::uuid from proj_pause),2,'complete','c0540000-0000-4000-8000-000000000002')->>'status','AI_ACTIVE','AT-054-04 complete resumes AI');
select is(public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id)->>'aiEligible','false','AT-054-04 delayed pause inbound stays suppressed after complete') from web_during;
create temporary table web_fresh as select public.ingest_web_event('a0540000-0000-4000-8000-000000000001','{"providerKey":"message:ov054-fresh","senderKey":"web-pause-054","kind":"message","eventTimeMs":1900000000000,"data":{"text":"new after complete"}}') id;
select is(public.project_web_conversation('a0540000-0000-4000-8000-000000000001',id)->>'aiEligible','true','AT-054-04 only newly received post-completion input is eligible') from web_fresh;
reset role;

select * from finish();
rollback;
