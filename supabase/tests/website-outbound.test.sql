-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into public.organizations(id,name,slug) values
 ('a0580000-0000-4000-8000-000000000001','OV-058 fixture','ov058-website-outbound'),
 ('a0580000-0000-4000-8000-000000000002','OV-058 facebook','ov058-facebook-outbox');

select has_table('public','web_outbound','durable web outbound');
select ok((select relrowsecurity from pg_class where oid='public.web_outbound'::regclass),'RLS enabled');
select ok(not has_table_privilege('authenticated','public.web_outbound','select'),'browser cannot read web outbound');
select ok(not has_table_privilege('service_role','public.web_outbound','insert'),'service cannot bypass enqueue RPC');
select ok(not has_table_privilege('service_role','public.web_outbound','update'),'service cannot patch visible state');
select ok(not has_function_privilege('authenticated','public.authorize_web_outbound(uuid,uuid,uuid,timestamptz)','execute'),'browser cannot authorize web outbound');
select has_function('public','claim_web_outbound_job',array['uuid','integer','timestamptz'],'WEB claimant exists');
select hasnt_column('public','web_outbound','page_id','WEB outbound has no page_id');
select hasnt_column('public','web_outbound','psid','WEB outbound has no psid');

create function pg_temp.retire_web(p_keep uuid) returns void language sql as $$
update public.business_jobs j set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null
from public.web_outbound o
where j.entity_id=o.id and j.kind='outbound_message' and j.status in ('queued','running') and o.id is distinct from p_keep;
$$;
create function pg_temp.retire_messenger(p_keep_page text) returns void language sql as $$
update public.business_jobs j set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null
from public.messenger_outbox o
where j.entity_id=o.id and j.kind='outbound_message' and j.status in ('queued','running') and o.page_id is distinct from p_keep_page;
$$;


-- AT-058-01 WEB inbound → finish → one web_outbound, zero messenger_outbox.
create temporary table web1 as select public.ingest_web_event('a0580000-0000-4000-8000-000000000001','{"providerKey":"message:ov058-01","senderKey":"web-user-058","kind":"message","eventTimeMs":1700000000000,"data":{"text":"xin chao"}}') id;
create temporary table c1 as select public.claim_consultation_job('d0580000-0000-4000-8000-000000000001','a0580000-0000-4000-8000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Cảm ơn bạn.","claims":[]}'),'AT-058-01 reply candidate commits') from c1;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Cảm ơn bạn.","claims":[]}'),'AT-058-04 finish replay is idempotent') from c1;
select is((select count(*) from public.web_outbound where inbound_event_id=(select id from web1)),1::bigint,'AT-058-01 one web outbound per candidate');
select is((select count(*) from public.messenger_outbox where organization_id='a0580000-0000-4000-8000-000000000001'),0::bigint,'AT-058-01 WEB never inserts messenger_outbox');
select is((select count(*) from public.business_jobs where kind='outbound_message' and entity_id=(select id from public.web_outbound where inbound_event_id=(select id from web1))),1::bigint,'one WEB outbound_message job');
select is((select kind from public.web_outbound where inbound_event_id=(select id from web1)),'reply','kind reply');
select is((select status from public.web_outbound where inbound_event_id=(select id from web1)),'PENDING','queued pending until persist-visible');
select is(public.ingest_web_event('a0580000-0000-4000-8000-000000000001','{"providerKey":"message:ov058-01","senderKey":"web-user-058","kind":"message","eventTimeMs":1700000000000,"data":{"text":"xin chao"}}'),(select id from web1),'inbound replay returns same event');
select is((select count(*) from public.web_outbound where organization_id='a0580000-0000-4000-8000-000000000001'),1::bigint,'inbound replay creates no second outbound');

create temporary table send1 as select * from public.claim_web_outbound_job('d0580000-0000-4000-8000-000000000011');
select is((select count(*) from send1),1::bigint,'AT-058-04 first worker claims WEB outbound');
select is((select count(*) from public.claim_web_outbound_job('d0580000-0000-4000-8000-000000000012')),0::bigint,'AT-058-04 second worker cannot claim live lease');
select is((select public.authorize_web_outbound(id,lease_owner,lease_token)->>'action' from send1),'visible','AT-058-01 persist visible when AI_ACTIVE');
select is((select status from public.web_outbound where id=(select entity_id from send1)),'VISIBLE','VISIBLE is customer-visible delivery');
select is((select public.authorize_web_outbound(id,lease_owner,lease_token)->>'status' from send1),'VISIBLE','AT-058-04 replay authorize does not duplicate');
select is((select count(*) from public.web_outbound where inbound_event_id=(select id from web1)),1::bigint,'AT-058-04 still one row after replay');
select is((select count(*) from public.claim_messenger_job('d0580000-0000-4000-8000-000000000013')),0::bigint,'messenger claimant does not take WEB jobs');

-- AT-058-02 WAITING_STAFF stores inbound, no AI reply; pause between generate withholds candidate.
create temporary table web_pause as select public.ingest_web_event('a0580000-0000-4000-8000-000000000001','{"providerKey":"message:ov058-pause","senderKey":"web-pause-058","kind":"message","eventTimeMs":1700000002000,"data":{"text":"pause race"}}') id;
create temporary table pause_claim as select public.claim_consultation_job('d0580000-0000-4000-8000-000000000003','a0580000-0000-4000-8000-000000000001') value;
select public.request_conversation_handoff('a0580000-0000-4000-8000-000000000001',(select id from web_pause),(value->>'revision')::integer,'customer_requested') from pause_claim;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"late reply","claims":[]}'),'paused generation withholds candidate') from pause_claim;
select is((select count(*) from public.web_outbound where inbound_event_id=(select id from web_pause)),0::bigint,'AT-058-02 paused conversation creates no reply outbound');
select is((select count(*) from public.web_inbound_events where id=(select id from web_pause)),1::bigint,'AT-058-02 inbound still stored');
select is((select count(*) from public.messenger_outbox where organization_id='a0580000-0000-4000-8000-000000000001'),0::bigint,'AT-058-02 still no messenger_outbox');

create temporary table web_waiting as select public.ingest_web_event('a0580000-0000-4000-8000-000000000001','{"providerKey":"message:ov058-waiting","senderKey":"web-pause-058","kind":"message","eventTimeMs":1700000003000,"data":{"text":"during staff"}}') id;
create temporary table waiting_claim as select public.claim_consultation_job('d0580000-0000-4000-8000-000000000004','a0580000-0000-4000-8000-000000000001') value;
select ok((select value is null or (select count(*) from public.web_outbound where inbound_event_id=(select id from web_waiting))=0 from waiting_claim),'AT-058-02 WAITING_STAFF does not persist AI reply');
select is((select count(*) from public.web_inbound_events where id=(select id from web_waiting)),1::bigint,'AT-058-02 waiting inbound persisted');
select is((select count(*) from public.web_outbound where inbound_event_id=(select id from web_waiting) and kind='reply'),0::bigint,'AT-058-02 no reply outbound while WAITING_STAFF');

-- AT-058-03 revision fence: handoff before persist-visible suppresses; complete does not revive.
create temporary table web_h as select public.ingest_web_event('a0580000-0000-4000-8000-000000000001','{"providerKey":"message:ov058-handoff-first","senderKey":"web-h-058","kind":"message","eventTimeMs":1700000004000,"data":{"text":"before send"}}') id;
create temporary table h1 as select public.claim_consultation_job('d0580000-0000-4000-8000-000000000005','a0580000-0000-4000-8000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Trả lời cũ.","claims":[]}'),'reply queued pending') from h1;
select public.request_conversation_handoff('a0580000-0000-4000-8000-000000000001',(select id from web_h),(select conversation_revision from public.web_outbound where inbound_event_id=(select id from web_h)),'customer_requested');
select pg_temp.retire_web((select id from public.web_outbound where inbound_event_id=(select id from web_h)));
create temporary table hsend as select * from public.claim_web_outbound_job('d0580000-0000-4000-8000-000000000014');
select is((select public.authorize_web_outbound(id,lease_owner,lease_token)->>'status' from hsend),'SUPPRESSED','AT-058-03 handoff before persist-visible suppresses');
select is((select status from public.web_outbound where id=(select entity_id from hsend)),'SUPPRESSED','suppressed persisted');
select is((select count(*) from public.web_outbound where inbound_event_id=(select id from web_h) and status='VISIBLE'),0::bigint,'AT-058-03 no visible leak');
reset role;
insert into auth.users(id) values('b0580000-0000-4000-8000-000000000181');
insert into public.staff_profiles(user_id,organization_id,role) values('b0580000-0000-4000-8000-000000000181','a0580000-0000-4000-8000-000000000001','manager');
create temporary table web_r as select public.ingest_web_event('a0580000-0000-4000-8000-000000000001','{"providerKey":"message:ov058-revive","senderKey":"web-r-058","kind":"message","eventTimeMs":1700000005000,"data":{"text":"revive"}}') id;
create temporary table r1 as select public.claim_consultation_job('d0580000-0000-4000-8000-000000000006','a0580000-0000-4000-8000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Revision cũ.","claims":[]}'),'old reply queued') from r1;
create temporary table convo_r as select conversation_id,conversation_revision from public.web_outbound where inbound_event_id=(select id from web_r);
select public.request_conversation_handoff('a0580000-0000-4000-8000-000000000001',(select id from web_r),(select conversation_revision from convo_r),'customer_requested');
select public.transition_conversation_handoff('a0580000-0000-4000-8000-000000000001','b0580000-0000-4000-8000-000000000181',(select conversation_id from convo_r),(select revision from public.conversations where id=(select conversation_id from convo_r)),'claim','c0580000-0000-4000-8000-000000000181');
select public.transition_conversation_handoff('a0580000-0000-4000-8000-000000000001','b0580000-0000-4000-8000-000000000181',(select conversation_id from convo_r),(select revision from public.conversations where id=(select conversation_id from convo_r)),'complete','c0580000-0000-4000-8000-000000000182');
select pg_temp.retire_web((select id from public.web_outbound where inbound_event_id=(select id from web_r)));
create temporary table rsend as select * from public.claim_web_outbound_job('d0580000-0000-4000-8000-000000000015');
select is((select public.authorize_web_outbound(id,lease_owner,lease_token)->>'status' from rsend),'SUPPRESSED','AT-058-03 complete does not revive old revision');
select is((select status from public.web_outbound where inbound_event_id=(select id from web_r)),'SUPPRESSED','stale revision stays suppressed');

-- handoff_ack is visible to the customer, still not Graph.
create temporary table web_ack as select public.ingest_web_event('a0580000-0000-4000-8000-000000000001','{"providerKey":"message:ov058-ack","senderKey":"web-ack-058","kind":"message","eventTimeMs":1700000006000,"data":{"text":"gặp nhân viên"}}') id;
create temporary table ack1 as select public.claim_consultation_job('d0580000-0000-4000-8000-000000000007','a0580000-0000-4000-8000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"handoff","intent":"handoff","reason":"customer_requested"}'),'handoff ack candidate') from ack1;
select is((select count(*) from public.web_outbound where kind='handoff_ack' and inbound_event_id=(select id from web_ack)),1::bigint,'one handoff_ack outbound');
select is((select count(*) from public.messenger_outbox where organization_id='a0580000-0000-4000-8000-000000000001'),0::bigint,'handoff_ack does not enqueue messenger_outbox');
select pg_temp.retire_web((select id from public.web_outbound where inbound_event_id=(select id from web_ack)));
create temporary table acksend as select * from public.claim_web_outbound_job('d0580000-0000-4000-8000-000000000016');
select is((select public.authorize_web_outbound(id,lease_owner,lease_token)->>'action' from acksend),'visible','handoff_ack persist-visible');
select is((select kind||':'||status from public.web_outbound where inbound_event_id=(select id from web_ack)),'handoff_ack:VISIBLE','ack visible for poll');

-- AT-058-05 Facebook receipts still enqueue messenger_outbox.
select public.ingest_facebook_events('a0580000-0000-4000-8000-000000000002','10000005801','[{"pageId":"10000005801","providerKey":"message:ov058-fb","kind":"message","senderId":"20000005801","recipientId":"10000005801","eventTimeMs":1577836800000,"data":{"text":"facebook"}}]');
create temporary table fb1 as select public.claim_consultation_job('d0580000-0000-4000-8000-000000000008','a0580000-0000-4000-8000-000000000002') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Cảm ơn Facebook.","claims":[]}'),'facebook reply candidate') from fb1;
select is((select count(*) from public.messenger_outbox where organization_id='a0580000-0000-4000-8000-000000000002'),1::bigint,'AT-058-05 Facebook still enqueues messenger_outbox');
select is((select count(*) from public.web_outbound where organization_id='a0580000-0000-4000-8000-000000000002'),0::bigint,'Facebook receipt does not insert web_outbound');
select pg_temp.retire_messenger('10000005801');
create temporary table fbsend as select * from public.claim_messenger_job('d0580000-0000-4000-8000-000000000018');
select is((select count(*) from fbsend),1::bigint,'AT-058-05 messenger claimant still takes Facebook jobs');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'action' from fbsend),'send','Facebook authorize still send');
select is((select count(*) from public.claim_web_outbound_job('d0580000-0000-4000-8000-000000000019')),0::bigint,'WEB claimant does not take Facebook jobs');

set local role authenticated;
select throws_ok($$select public.authorize_web_outbound('d0580000-0000-4000-8000-000000000001','d0580000-0000-4000-8000-000000000001','d0580000-0000-4000-8000-000000000001')$$,'42501',null,'browser cannot authorize web outbound');
reset role;

select * from finish();
rollback;
