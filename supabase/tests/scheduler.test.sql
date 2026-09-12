begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','claim_marketing_tick','scheduler claim rpc exists');
select has_function('public','apply_slot_decision','slot decision rpc exists');
select has_table('public','marketing_tick_receipts','tick receipts persist');
insert into public.organizations(id,name,slug) values('a3600000-0000-4000-8000-000000000001','Scheduler sql','scheduler-036');
insert into auth.users(id) values('b3600000-0000-4000-8000-000000000001');
insert into public.staff_profiles(user_id,organization_id,role) values('b3600000-0000-4000-8000-000000000001','a3600000-0000-4000-8000-000000000001','manager');
insert into public.business_settings(organization_id,revision,settings) values('a3600000-0000-4000-8000-000000000001',1,'{"brandName":"Fixture","brandVoice":"Plain","allowedTopics":[],"forbiddenTopics":[],"timezone":"Asia/Ho_Chi_Minh","goalSelection":"auto","managerGoal":"","timingMode":"constrained","dailyCap":1,"windows":[{"start":"00:00","end":"23:59"}],"objective":"mixed"}');
insert into public.marketing_control(organization_id,status,reason) values('a3600000-0000-4000-8000-000000000001','RUNNING','enabled');
insert into public.products(id,organization_id,source_url,canonical_url,name,price_vnd,stock_quantity,in_stock,quality) values('c3600000-0000-4000-8000-000000000001','a3600000-0000-4000-8000-000000000001','urn:scheduler','urn:scheduler','Fixture product',100000,2,true,'partial');
insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone,decision)
 values('e3600000-0000-4000-8000-000000000001','a3600000-0000-4000-8000-000000000001','Ordinary','mixed','product','c3600000-0000-4000-8000-000000000001',false,'{"id":"c3600000-0000-4000-8000-000000000001","skus":[{"id":"c3600000-0000-4000-8000-000000000001","priceVnd":100000,"stockQuantity":2}]}','{}','Asia/Ho_Chi_Minh','{}');
insert into public.campaign_slots(id,campaign_id,ordinal,scheduled_at) values('d3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000001',1,clock_timestamp()-interval '1 minute');
insert into public.campaign_slots(id,campaign_id,ordinal) values('d3600000-0000-4000-8000-000000000002','e3600000-0000-4000-8000-000000000001',2);

select is((public.claim_marketing_tick('a3600000-0000-4000-8000-000000000001','f3600000-0000-4000-8000-000000000001',clock_timestamp())->'slots')::jsonb, public.claim_marketing_tick('a3600000-0000-4000-8000-000000000001','f3600000-0000-4000-8000-000000000001',clock_timestamp())->'slots','tick request replays');
select ok(jsonb_array_length(public.claim_marketing_tick('a3600000-0000-4000-8000-000000000001','f3600000-0000-4000-8000-000000000002',clock_timestamp())->'slots')<=1,'second tick cannot take the same claimed planned slot');
select is((select count(*) from public.campaign_slots s join public.campaigns c on c.id=s.campaign_id where c.organization_id='a3600000-0000-4000-8000-000000000001' and s.scheduled_at is not null and timezone('Asia/Ho_Chi_Minh',s.scheduled_at)::date=timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date and s.status not in ('SKIPPED','FAILED')),1::bigint,'daily cap reservations');

select lives_ok($$select public.apply_slot_decision('a3600000-0000-4000-8000-000000000001','d3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000001','f3600000-0000-4000-8000-000000000010',0,'{"action":"ready","reason":"prepared"}')$$,'prepare marks READY');
select is((select status from public.campaign_slots where id='d3600000-0000-4000-8000-000000000001'),'READY','ready not published');
select is((select count(*) from public.campaign_slots where status='PUBLISHED' and campaign_id='e3600000-0000-4000-8000-000000000001'),0::bigint,'never published');

update public.marketing_control set status='PAUSED',reason='manual' where organization_id='a3600000-0000-4000-8000-000000000001';
select is(jsonb_array_length(public.claim_marketing_tick('a3600000-0000-4000-8000-000000000001','f3600000-0000-4000-8000-000000000003',clock_timestamp())->'slots'),0,'paused ordinary not claimed');

insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone)
 values('e3600000-0000-4000-8000-000000000002','a3600000-0000-4000-8000-000000000001','Priority','mixed','product','c3600000-0000-4000-8000-000000000001',true,'{"id":"c3600000-0000-4000-8000-000000000001","skus":[{"id":"c3600000-0000-4000-8000-000000000001","priceVnd":100000,"stockQuantity":2}]}','{}','Asia/Ho_Chi_Minh');
insert into public.campaign_slots(id,campaign_id,ordinal,scheduled_at) values('d3600000-0000-4000-8000-000000000003','e3600000-0000-4000-8000-000000000002',1,clock_timestamp()-interval '1 minute');
update public.marketing_control set status='PAUSED',priority_campaign_id='e3600000-0000-4000-8000-000000000002',revision=revision+1,reason='priority_in_progress' where organization_id='a3600000-0000-4000-8000-000000000001';
select is((public.claim_marketing_tick('a3600000-0000-4000-8000-000000000001','f3600000-0000-4000-8000-000000000004',clock_timestamp())->'slots'->0->>'campaignId'),'e3600000-0000-4000-8000-000000000002','matching priority claimed while paused');
select lives_ok($$select public.apply_slot_decision('a3600000-0000-4000-8000-000000000001','d3600000-0000-4000-8000-000000000003','e3600000-0000-4000-8000-000000000002','f3600000-0000-4000-8000-000000000011',(select revision from public.marketing_control where organization_id='a3600000-0000-4000-8000-000000000001'),'{"action":"ready","reason":"prepared"}')$$,'priority slot ready');
select lives_ok($$select public.complete_priority_control('a3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000002','f3600000-0000-4000-8000-000000000012',(select revision from public.marketing_control where organization_id='a3600000-0000-4000-8000-000000000001'))$$,'priority complete');
select is((select status from public.marketing_control where organization_id='a3600000-0000-4000-8000-000000000001'),'PAUSED','priority complete stays paused');
select is((select priority_campaign_id from public.marketing_control where organization_id='a3600000-0000-4000-8000-000000000001'),null::uuid,'priority id cleared');
select is((select status from public.campaigns where id='e3600000-0000-4000-8000-000000000002'),'PLANNED','campaign stays nonterminal');

update public.products set stock_quantity=0,in_stock=false where id='c3600000-0000-4000-8000-000000000001';
insert into public.campaigns(id,organization_id,title,objective,source_kind,source_ref,priority,source_snapshot,settings_snapshot,timezone,decision)
 values('e3600000-0000-4000-8000-000000000003','a3600000-0000-4000-8000-000000000001','Stale','mixed','product','c3600000-0000-4000-8000-000000000001',false,'{"id":"c3600000-0000-4000-8000-000000000001","skus":[{"id":"c3600000-0000-4000-8000-000000000001","priceVnd":100000,"stockQuantity":2}]}','{}','Asia/Ho_Chi_Minh','{}');
insert into public.campaign_slots(id,campaign_id,ordinal,scheduled_at) values('d3600000-0000-4000-8000-000000000004','e3600000-0000-4000-8000-000000000003',1,clock_timestamp()-interval '1 minute');
update public.marketing_control set status='RUNNING',priority_campaign_id=null,revision=revision+1,reason='enabled' where organization_id='a3600000-0000-4000-8000-000000000001';
select is(public.inspect_campaign_source('a3600000-0000-4000-8000-000000000001','e3600000-0000-4000-8000-000000000003')->>'health','stale_stock','zero stock classified');
select lives_ok($$select public.apply_slot_decision('a3600000-0000-4000-8000-000000000001','d3600000-0000-4000-8000-000000000004','e3600000-0000-4000-8000-000000000003','f3600000-0000-4000-8000-000000000013',(select revision from public.marketing_control where organization_id='a3600000-0000-4000-8000-000000000001'),'{"action":"skipped","reason":"stale_stock","replace":true}')$$,'skip with replacement');
select is((select count(*) from public.campaign_slots where replaced_slot_id='d3600000-0000-4000-8000-000000000004'),1::bigint,'one replacement');
select throws_ok($$select public.apply_slot_decision('a3600000-0000-4000-8000-000000000001','d3600000-0000-4000-8000-000000000004','e3600000-0000-4000-8000-000000000003',gen_random_uuid(),(select revision from public.marketing_control where organization_id='a3600000-0000-4000-8000-000000000001'),'{"action":"published","reason":"nope"}')$$,'22023','SCHEDULER_INVALID','cannot mark published');

update public.campaigns set status='FAILED',version=version+1 where id='e3600000-0000-4000-8000-000000000001';
select is(jsonb_array_length(public.claim_marketing_tick('a3600000-0000-4000-8000-000000000001','f3600000-0000-4000-8000-000000000005',clock_timestamp())->'slots'),0,'terminal campaign not claimed');
select ok(not has_function_privilege('authenticated','public.claim_marketing_tick(uuid,uuid,timestamptz,integer)','EXECUTE'),'browser cannot claim');
select ok(not has_table_privilege('service_role','public.campaign_slots','UPDATE'),'slots stay rpc-only');
select ok(pg_get_functiondef('public.claim_business_job(uuid,integer,timestamptz)'::regprocedure) like '%automation_tick%','generic claim excludes automation_tick');
select * from finish();
rollback;
