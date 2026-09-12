begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_table('public','messenger_outbox','durable messenger outbox');
select has_view('public','messenger_outbox_operations','operator-visible send outcomes');
select ok((select relrowsecurity from pg_class where oid='public.messenger_outbox'::regclass),'RLS enabled');
select ok(not has_table_privilege('authenticated','public.messenger_outbox','select'),'browser cannot read outbox text');
select ok(not has_table_privilege('service_role','public.messenger_outbox','insert'),'service cannot bypass enqueue RPC');
select ok(not has_table_privilege('service_role','public.messenger_outbox','update'),'service cannot patch send state');
select ok(not has_function_privilege('authenticated','public.authorize_messenger_send(uuid,uuid,uuid,timestamptz)','execute'),'browser cannot authorize send');
select has_column('public','messenger_outbox_operations','error_code','filtered error is visible');
select hasnt_column('public','messenger_outbox_operations','text','operator view hides message body');
select hasnt_column('public','messenger_outbox_operations','psid','operator view hides PSID');
create function pg_temp.retire_outbound(p_keep_page text) returns void language sql as $$
update public.business_jobs j set status='succeeded',lease_owner=null,lease_token=null,lease_expires_at=null,attempt_started_at=null
from public.messenger_outbox o
where j.entity_id=o.id and j.kind='outbound_message' and j.status in ('queued','running') and o.page_id is distinct from p_keep_page;
$$;

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001801','[
 {"pageId":"10000001801","providerKey":"message:ov018-a","kind":"message","senderId":"20000001801","recipientId":"10000001801","eventTimeMs":1577836800000,"data":{"text":"Tư vấn"}},
 {"pageId":"10000001801","providerKey":"message:ov018-b","kind":"message","senderId":"20000001801","recipientId":"10000001801","eventTimeMs":1577836801000,"data":{"text":"Gặp nhân viên"}}
]');
create temporary table c1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Cảm ơn bạn.","claims":[]}'),'reply candidate commits') from c1;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Cảm ơn bạn.","claims":[]}'),'finish replay is idempotent') from c1;
select is((select count(*) from public.messenger_outbox where inbound_event_id=(select (value#>>'{job,entity_id}')::uuid from c1)),1::bigint,'AT-018-01 one outbox per candidate');
select is((select count(*) from public.business_jobs where kind='outbound_message' and entity_id=(select id from public.messenger_outbox where inbound_event_id=(select (value#>>'{job,entity_id}')::uuid from c1))),1::bigint,'one outbound job');
select is(public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001801','[{"pageId":"10000001801","providerKey":"message:ov018-a","kind":"message","senderId":"20000001801","recipientId":"10000001801","eventTimeMs":1577836800000,"data":{"text":"Tư vấn"}}]'),0,'webhook replay inserts nothing');
select is((select count(*) from public.messenger_outbox where page_id='10000001801'),1::bigint,'webhook replay creates no second outbox');

create temporary table send1 as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000011');
select is((select count(*) from send1),1::bigint,'AT-018-01 first worker claims outbound');
select is((select count(*) from public.claim_messenger_job('d1800000-0000-0000-0000-000000000012')),0::bigint,'second worker cannot claim live lease');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'action' from send1),'send','within 24h window authorizes');
select is((select status from public.messenger_outbox where id=(select entity_id from send1)),'SENDING','SENDING persisted before network');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:01+00')->>'status' from send1),'UNKNOWN','AT-018-05 restart SENDING is UNKNOWN not resend');
select is((select status from public.messenger_outbox where id=(select entity_id from send1)),'UNKNOWN','UNKNOWN is terminal');
select is((select count(*) from public.messenger_outbox_operations where id=(select entity_id from send1) and status='UNKNOWN'),1::bigint,'operator view shows UNKNOWN');

create temporary table c2 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"handoff","intent":"handoff","reason":"customer_requested"}'),'handoff ack candidate') from c2;
select is((select count(*) from public.messenger_outbox where kind='handoff_ack' and inbound_event_id=(select (value#>>'{job,entity_id}')::uuid from c2)),1::bigint,'AT-018-03 one ACK outbox');
select is((select count(distinct handoff_id) from public.messenger_outbox where kind='handoff_ack' and page_id='10000001801'),1::bigint,'one handoff id');

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001802','[{"pageId":"10000001802","providerKey":"message:ov018-pause","kind":"message","senderId":"20000001802","recipientId":"10000001802","eventTimeMs":1577836800000,"data":{"text":"pause race"}}]');
create temporary table pause_claim as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001') value;
select public.request_conversation_handoff('a0000000-0000-0000-0000-000000000001',(value#>>'{job,entity_id}')::uuid,(value->>'revision')::integer,'customer_requested') from pause_claim;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"late reply","claims":[]}'),'paused generation withholds candidate') from pause_claim;
select is((select count(*) from public.messenger_outbox where inbound_event_id=(select (value#>>'{job,entity_id}')::uuid from pause_claim)),0::bigint,'AT-018-03 paused conversation creates no reply outbox');

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001803','[{"pageId":"10000001803","providerKey":"message:ov018-handoff-first","kind":"message","senderId":"20000001803","recipientId":"10000001803","eventTimeMs":1577836800000,"data":{"text":"before send"}}]');
create temporary table h1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Trả lời cũ.","claims":[]}'),'reply queued') from h1;
select public.request_conversation_handoff('a0000000-0000-0000-0000-000000000001',(value#>>'{job,entity_id}')::uuid,(select conversation_revision from public.messenger_outbox where inbound_event_id=(value#>>'{job,entity_id}')::uuid),'customer_requested') from h1;
select pg_temp.retire_outbound('10000001803');
create temporary table hsend as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000013');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'status' from hsend),'SUPPRESSED','AT-018-02 handoff before authorize suppresses');
select is((select status from public.messenger_outbox where id=(select entity_id from hsend)),'SUPPRESSED','suppressed persisted');

insert into auth.users(id) values('b0000000-0000-4000-8000-000000000181');
insert into public.staff_profiles(user_id,organization_id,role) values('b0000000-0000-4000-8000-000000000181','a0000000-0000-0000-0000-000000000001','manager');
select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001804','[{"pageId":"10000001804","providerKey":"message:ov018-revive","kind":"message","senderId":"20000001804","recipientId":"10000001804","eventTimeMs":1577836800000,"data":{"text":"revive"}}]');
create temporary table r1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Revision cũ.","claims":[]}'),'old reply queued') from r1;
create temporary table convo4 as select conversation_id,conversation_revision from public.messenger_outbox where inbound_event_id=(select (value#>>'{job,entity_id}')::uuid from r1);
select public.request_conversation_handoff('a0000000-0000-0000-0000-000000000001',(select (value#>>'{job,entity_id}')::uuid from r1),(select conversation_revision from convo4),'customer_requested');
select public.transition_conversation_handoff('a0000000-0000-0000-0000-000000000001','b0000000-0000-4000-8000-000000000181',(select conversation_id from convo4),(select revision from public.conversations where id=(select conversation_id from convo4)),'claim','c0000000-0000-4000-8000-000000000181');
select public.transition_conversation_handoff('a0000000-0000-0000-0000-000000000001','b0000000-0000-4000-8000-000000000181',(select conversation_id from convo4),(select revision from public.conversations where id=(select conversation_id from convo4)),'complete','c0000000-0000-4000-8000-000000000182');
select pg_temp.retire_outbound('10000001804');
create temporary table rsend as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000014');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'status' from rsend),'SUPPRESSED','AT-018-02 complete does not revive old revision');

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001805','[{"pageId":"10000001805","providerKey":"message:ov018-window","kind":"message","senderId":"20000001805","recipientId":"10000001805","eventTimeMs":1577836800000,"data":{"text":"window"}}]');
create temporary table w1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Trong cửa sổ.","claims":[]}'),'window fixture queued') from w1;
select pg_temp.retire_outbound('10000001805');
create temporary table wsend as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000015');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-02 00:00:00+00')->>'status' from wsend),'FAILED','AT-018-04 exact 24h boundary fails');
select is((select error_code from public.messenger_outbox where id=(select entity_id from wsend)),'window','window error is filtered');

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001806','[{"pageId":"10000001806","providerKey":"message:ov018-token","kind":"message","senderId":"20000001806","recipientId":"10000001806","eventTimeMs":1577836800000,"data":{"text":"token"}}]');
create temporary table t1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Token hết hạn.","claims":[]}'),'token fixture queued') from t1;
select pg_temp.retire_outbound('10000001806');
create temporary table tsend as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000016');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'action' from tsend),'send','token path reaches network seam');
select is((select public.complete_messenger_send(id,lease_owner,lease_token,'{"outcome":"rejected","errorCode":"token"}'::jsonb,'2020-01-01 12:00:01+00')->>'retry' from tsend),'false','AT-018-04 expired token does not retry');
select is((select status from public.messenger_outbox where id=(select entity_id from tsend)),'FAILED','token failure is terminal');
select is((select public.complete_messenger_send(id,lease_owner,lease_token,'{"outcome":"accepted","messageId":"mid.late"}'::jsonb,'2020-01-01 12:00:02+00')->>'ok' from tsend),'false','terminal rows cannot be resurrected');

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001807','[{"pageId":"10000001807","providerKey":"message:ov018-malformed","kind":"message","senderId":"20000001807","recipientId":"10000001807","eventTimeMs":1577836800000,"data":{"text":"malformed"}}]');
create temporary table m1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Malformed success.","claims":[]}'),'malformed fixture queued') from m1;
select pg_temp.retire_outbound('10000001807');
create temporary table msend as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000017');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'action' from msend),'send','malformed path authorizes once');
select is((select public.complete_messenger_send(id,lease_owner,lease_token,'{"outcome":"accepted"}'::jsonb,'2020-01-01 12:00:01+00')->>'status' from msend),'UNKNOWN','AT-018-04 accepted without message id is UNKNOWN');

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001808','[{"pageId":"10000001808","providerKey":"message:ov018-sent","kind":"message","senderId":"20000001808","recipientId":"10000001808","eventTimeMs":1577836800000,"data":{"text":"sent"}}]');
create temporary table s1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Đã gửi.","claims":[]}'),'sent fixture queued') from s1;
select pg_temp.retire_outbound('10000001808');
create temporary table ssend as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000018');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'action' from ssend),'send','accepted path authorizes');
select is((select public.complete_messenger_send(id,lease_owner,lease_token,'{"outcome":"accepted","messageId":"mid.accepted"}'::jsonb,'2020-01-01 12:00:01+00')->>'status' from ssend),'SENT','API accepted stores SENT');
select is((select remote_id from public.messenger_outbox where id=(select entity_id from ssend)),'mid.accepted','remote id stored');
select public.request_conversation_handoff('a0000000-0000-0000-0000-000000000001',(select (value#>>'{job,entity_id}')::uuid from s1),(select conversation_revision from public.messenger_outbox where id=(select entity_id from ssend)),'customer_requested');
select is((select status from public.messenger_outbox where id=(select entity_id from ssend)),'SENT','handoff after Meta accept cannot revoke');

select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000001809','[{"pageId":"10000001809","providerKey":"message:ov018-retry","kind":"message","senderId":"20000001809","recipientId":"10000001809","eventTimeMs":1577836800000,"data":{"text":"retry"}}]');
create temporary table y1 as select public.claim_consultation_job('d1800000-0000-0000-0000-000000000020','a0000000-0000-0000-0000-000000000001') value;
select ok(public.finish_consultation((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'{"type":"reply","intent":"praise","text":"Thử lại.","claims":[]}'),'retry fixture queued') from y1;
select pg_temp.retire_outbound('10000001809');
create temporary table ysend as select * from public.claim_messenger_job('d1800000-0000-0000-0000-000000000019');
select is((select public.authorize_messenger_send(id,lease_owner,lease_token,'2020-01-01 12:00:00+00')->>'action' from ysend),'send','rate limit path authorizes');
select is((select public.complete_messenger_send(id,lease_owner,lease_token,'{"outcome":"rejected","errorCode":"rate_limit"}'::jsonb,'2020-01-01 12:00:01+00')->>'retry' from ysend),'true','429/5xx bounded retry only when not accepted');
select is((select status from public.messenger_outbox where id=(select entity_id from ysend)),'PENDING','retry returns to PENDING');

select is((select count(*) from public.messenger_outbox where kind='handoff_ack' and handoff_id in (select handoff_id from public.messenger_outbox where kind='handoff_ack' group by handoff_id having count(*)>1)),0::bigint,'AT-018-03 no duplicate ACK rows');
set local role authenticated;
select throws_ok($$select public.authorize_messenger_send('d1800000-0000-0000-0000-000000000001','d1800000-0000-0000-0000-000000000001','d1800000-0000-0000-0000-000000000001')$$,'42501',null,'browser cannot authorize send');
reset role;

select * from finish();
rollback;
