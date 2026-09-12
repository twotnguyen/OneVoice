begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','unschedule_campaign_slot','unschedule rpc exists');
select has_function('public','read_slot_content_history','slot history rpc exists');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.campaign_slots'::regclass and conname='campaign_slots_status_check') like '%WAITING_CHANNEL%','status check includes WAITING_CHANNEL');

insert into public.organizations(id,name,slug) values('a6100000-0000-4000-8000-000000000001','Waiting channel','waiting-061');
insert into auth.users(id) values('b6100000-0000-4000-8000-000000000001'),('b6100000-0000-4000-8000-000000000002');
insert into public.staff_profiles(user_id,organization_id,role) values
 ('b6100000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000001','manager'),
 ('b6100000-0000-4000-8000-000000000002','a6100000-0000-4000-8000-000000000001','staff');
insert into public.business_settings(organization_id,revision,settings) values('a6100000-0000-4000-8000-000000000001',1,'{"brandName":"Fixture","brandVoice":"Plain","allowedTopics":[],"forbiddenTopics":[],"timezone":"Asia/Ho_Chi_Minh","goalSelection":"auto","managerGoal":"","timingMode":"constrained","dailyCap":1,"windows":[{"start":"00:00","end":"23:59"}],"objective":"mixed"}');
insert into public.marketing_control(organization_id,status,reason) values('a6100000-0000-4000-8000-000000000001','RUNNING','enabled');
insert into public.products(id,organization_id,source_url,canonical_url,name,price_vnd,stock_quantity,in_stock,quality) values('c6100000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000001','urn:waiting','urn:waiting','Fixture product',100000,2,true,'partial');
insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone,decision)
 values('e6100000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000001','Ordinary','mixed','product','c6100000-0000-4000-8000-000000000001',false,'{"id":"c6100000-0000-4000-8000-000000000001","skus":[{"id":"c6100000-0000-4000-8000-000000000001","priceVnd":100000,"stockQuantity":2}]}','{}','Asia/Ho_Chi_Minh','{}');
insert into public.campaign_slots(id,campaign_id,ordinal,scheduled_at) values('d6100000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001',1,clock_timestamp()-interval '1 minute');
insert into public.content_versions(id,organization_id,slot_id,version,request_id,document,content_hash)
 values('f6100000-0000-4000-8000-000000000001','a6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001',1,'f6100000-0000-4000-8000-000000000011',
  '{"schema":"onevoice.content.v1","draft":{"post":{"hook":"Hook","caption":"Caption","cta":"Nhắn tin để được tư vấn"},"script":null,"model":{"id":"fixture","responseId":null},"claims":[]},"evidence":[],"templates":[],"fields":{"post.hook":"Hook","post.caption":"Caption","post.cta":"Nhắn tin để được tư vấn"},"validation":{"status":"VALID","validator":"ov032-v1"},"artifactHash":null,"contentHash":"ab"}',
  repeat('ab',32));
update public.campaign_slots set content_version_id='f6100000-0000-4000-8000-000000000001', content_revision=1 where id='d6100000-0000-4000-8000-000000000001';

select lives_ok($$insert into public.campaign_slots(id,campaign_id,ordinal,status) values('d6100000-0000-4000-8000-000000000099','e6100000-0000-4000-8000-000000000001',99,'WAITING_CHANNEL')$$,'WAITING_CHANNEL accepted');
select throws_ok($$insert into public.campaign_slots(id,campaign_id,ordinal,status) values('d6100000-0000-4000-8000-000000000098','e6100000-0000-4000-8000-000000000001',98,'GRAPH')$$,'23514','new row for relation "campaign_slots" violates check constraint "campaign_slots_status_check"','unknown status rejected');

select lives_ok($$select public.apply_slot_decision('a6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000021',0,'{"action":"waiting_channel","reason":"missing_publishing_provider","contentVersionId":"f6100000-0000-4000-8000-000000000001"}')$$,'due without provider waits');
select is((select status from public.campaign_slots where id='d6100000-0000-4000-8000-000000000001'),'WAITING_CHANNEL','AT-061-03 waiting once');
select is((select decision_reason from public.campaign_slots where id='d6100000-0000-4000-8000-000000000001'),'missing_publishing_provider','reason persisted');
select is((public.apply_slot_decision('a6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000021',0,'{"action":"waiting_channel","reason":"missing_publishing_provider","contentVersionId":"f6100000-0000-4000-8000-000000000001"}')->>'status'),'WAITING_CHANNEL','same request replays');
select is((public.apply_slot_decision('a6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000022',0,'{"action":"waiting_channel","reason":"missing_publishing_provider","contentVersionId":"f6100000-0000-4000-8000-000000000001"}')->>'status'),'WAITING_CHANNEL','second tick does not republish');
select is((select count(*) from public.campaign_slots where campaign_id='e6100000-0000-4000-8000-000000000001' and status='PUBLISHED'),0::bigint,'never published');
select throws_ok($$select public.apply_slot_decision('a6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001',gen_random_uuid(),0,'{"action":"published","reason":"nope"}')$$,'22023','SCHEDULER_INVALID','cannot mark published');
select is(jsonb_array_length(public.claim_marketing_tick('a6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000030',clock_timestamp())->'slots'),0,'WAITING_CHANNEL not reclaimed');

select is(public.read_slot_content_history('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000002','d6100000-0000-4000-8000-000000000001')->>'caption','Caption','staff can read caption history');
select is(public.read_slot_content_history('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001')->'validation'->>'status','VALID','Truth Guard on history');
select is(jsonb_array_length(public.read_slot_content_history('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001')->'versions'),1,'version history preserved');
select is(public.read_campaigns('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001')->'slots'->0->>'status','WAITING_CHANNEL','calendar record shows waiting');
select is(public.read_campaigns('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000001','e6100000-0000-4000-8000-000000000001')->'slots'->0->>'caption','Caption','calendar shows caption');

select throws_ok($$update public.content_versions set content_hash=repeat('cd',32) where id='f6100000-0000-4000-8000-000000000001'$$,'55000','audit events are append-only','content_versions no UPDATE');
select throws_ok($$delete from public.content_versions where id='f6100000-0000-4000-8000-000000000001'$$,'55000','audit events are append-only','content_versions no DELETE');

select throws_ok($$select public.unschedule_campaign_slot('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000002','d6100000-0000-4000-8000-000000000001',gen_random_uuid())$$,'42501','CAMPAIGN_FORBIDDEN','staff cannot unschedule');
select lives_ok($$select public.unschedule_campaign_slot('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000040')$$,'manager unschedule');
select is((select scheduled_at from public.campaign_slots where id='d6100000-0000-4000-8000-000000000001'),null::timestamptz,'unschedule clears time');
select is((select status from public.campaign_slots where id='d6100000-0000-4000-8000-000000000001'),'WAITING_CHANNEL','unschedule keeps waiting');
select is((select count(*) from public.campaign_slots where id='d6100000-0000-4000-8000-000000000001' and status='PUBLISHED'),0::bigint,'unschedule not published');
select is((select count(*) from public.content_versions where slot_id='d6100000-0000-4000-8000-000000000001'),1::bigint,'versions survive unschedule');
select is((public.unschedule_campaign_slot('a6100000-0000-4000-8000-000000000001','b6100000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000040')->>'reason'),'unscheduled','unschedule replays');

update public.marketing_control set status='PAUSED',reason='manual' where organization_id='a6100000-0000-4000-8000-000000000001';
select is(jsonb_array_length(public.claim_marketing_tick('a6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000031',clock_timestamp())->'slots'),0,'AT-061-04 paused ordinary not claimed');

select ok(not has_function_privilege('authenticated','public.unschedule_campaign_slot(uuid,uuid,uuid,uuid)','EXECUTE'),'browser cannot unschedule');
select ok(not has_table_privilege('service_role','public.campaign_slots','UPDATE'),'slots stay rpc-only');
select * from finish();
rollback;
