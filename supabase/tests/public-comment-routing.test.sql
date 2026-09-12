begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);
select has_table('public','public_comment_invitations','public comment invite outbox');
select has_view('public','public_comment_operations','operator-visible comment send outcomes');
select ok((select relrowsecurity from pg_class where oid='public.public_comment_invitations'::regclass),'RLS enabled');
select ok(not has_table_privilege('authenticated','public.public_comment_invitations','select'),'browser cannot read public comment outbox');
select ok(not has_table_privilege('service_role','public.public_comment_invitations','insert'),'service must use disposition RPC');
select ok(not has_function_privilege('authenticated','public.record_public_comment_disposition(uuid,uuid,uuid,text)','execute'),'browser cannot record disposition');
select hasnt_column('public','public_comment_operations','text','operator view hides invite body');
insert into public.organizations(id,name,slug) values('d1900000-0000-0000-0000-000000000099','OV019 sql','ov019-sql-fixture');
select public.ingest_facebook_events('d1900000-0000-0000-0000-000000000099','10000001901','[
 {"pageId":"10000001901","providerKey":"comment:ov019-a","kind":"comment","senderId":"20000001901","recipientId":"10000001901","eventTimeMs":1700000000000,"data":{"item":"comment","verb":"add","comment_id":"10000001901_1","text":"giá bao nhiêu"}},
 {"pageId":"10000001901","providerKey":"comment:ov019-edit","kind":"comment","senderId":"20000001901","recipientId":"10000001901","eventTimeMs":1700000001000,"data":{"item":"comment","verb":"edited","comment_id":"10000001901_1","text":"còn hàng không"}}
]');
create temporary table c1 as select public.claim_public_comment_job('d1900000-0000-0000-0000-000000000001') value;
select ok((select value is not null from c1),'claims a public comment job');
select ok((select public.record_public_comment_disposition((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'INVITE')->>'ok')::boolean,'first invite records') from c1;
select ok(public.finish_business_job((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid), 'finishes first comment job') from c1;
create temporary table c2 as select public.claim_public_comment_job('d1900000-0000-0000-0000-000000000002') value;
select ok((select public.record_public_comment_disposition((value#>>'{job,id}')::uuid,(value#>>'{job,lease_owner}')::uuid,(value#>>'{job,lease_token}')::uuid,'INVITE')->>'duplicate')::boolean,'edit is first-write-wins') from c2;
select is((select count(*) from public.public_comment_invitations where page_id='10000001901' and comment_id='10000001901_1'),1::bigint,'AT-019-03 one invitation per Page+comment');
select is((select count(*) from public.business_jobs where kind='outbound_comment' and organization_id='d1900000-0000-0000-0000-000000000099' and entity_id in (select id from public.public_comment_invitations where page_id='10000001901')),1::bigint,'one outbound public comment job');
select is(public.claim_consultation_job('d1900000-0000-0000-0000-000000000003','d1900000-0000-0000-0000-000000000099'),null::jsonb,'AT-019-04 comment does not open consultation');
select is((select count(*) from public.conversations where page_id='10000001901'),0::bigint,'no private conversation window');
select ok(not exists(select 1 from public.claim_business_job('d1900000-0000-0000-0000-000000000009') b join public.facebook_inbound_events e on e.id=b.entity_id where e.page_id='10000001901'),'generic claimant cannot steal public comments');

create temporary table send1 as select * from public.claim_public_comment_send_job('d1900000-0000-0000-0000-000000000010');
select is((select public.authorize_public_comment_send(id,lease_owner,lease_token)->>'action' from send1),'send','authorize persists send');
select is((select status from public.public_comment_invitations where page_id='10000001901'),'SENDING','SENDING before network');
select is((select public.authorize_public_comment_send(id,lease_owner,lease_token)->>'status' from send1),'UNKNOWN','AT-019-03 restart SENDING is UNKNOWN without resend');
select is((select status||':'||error_code from public.public_comment_invitations where page_id='10000001901'),'UNKNOWN:unknown','unknown is durable');
select * from finish();
rollback;
