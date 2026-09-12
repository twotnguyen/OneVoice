begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
select has_table('public','facebook_inbound_events','Facebook events persisted');
select ok((select relrowsecurity from pg_class where oid='public.facebook_inbound_events'::regclass),'RLS enabled');
select ok(not has_table_privilege('authenticated','public.facebook_inbound_events','SELECT'),'browser cannot read private event content');
select ok(not has_table_privilege('service_role','public.facebook_inbound_events','INSERT'),'service must use atomic ingestion RPC');
set local role anon;
select throws_ok($$select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000000001','[]')$$,'42501',null,'anonymous ingestion forbidden');
reset role;
set local role service_role;
select is(public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000000001','[
 {"pageId":"10000000001","providerKey":"message:fixture","kind":"message","senderId":"20000000001","recipientId":"10000000001","eventTimeMs":1700000000000,"data":{"text":"fake fixture"}},
 {"pageId":"10000000001","providerKey":"echo:fixture","kind":"echo","senderId":"10000000001","recipientId":"20000000001","eventTimeMs":1700000000000,"data":{"text":"fake echo"}}
]'),2,'message and echo persisted');
select is((select count(*) from public.business_jobs j join public.facebook_inbound_events e on e.id=j.entity_id where e.page_id='10000000001'),1::bigint,'only actionable message enqueued; echo cannot reply loop');
select is(public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000000001','[{"pageId":"10000000001","providerKey":"message:fixture","kind":"message","senderId":"20000000001","recipientId":"10000000001","eventTimeMs":1700000000000,"data":{"text":"fake fixture"}}]'),0,'duplicate delivery deduplicates');
select is((select count(*) from public.business_jobs j join public.facebook_inbound_events e on e.id=j.entity_id where e.page_id='10000000001'),1::bigint,'duplicate creates no second job');
select is(public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000000001','[{"pageId":"10000000001","providerKey":"message:older","kind":"message","senderId":"20000000001","recipientId":"10000000001","eventTimeMs":1600000000000,"data":{"text":"older fake fixture"}}]'),1,'out of order delivery retained');
select is((select min(event_time_ms) from public.facebook_inbound_events where page_id='10000000001'),1600000000000::bigint,'provider timestamp retained');
select throws_ok($$select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000000001','[
 {"pageId":"10000000001","providerKey":"message:rollback","kind":"message","eventTimeMs":1700000000000,"data":{}},
 {"pageId":"99999999999","providerKey":"message:wrong-page","kind":"message","eventTimeMs":1700000000000,"data":{}}
]')$$,'22023','invalid_facebook_page','invalid batch aborts after earlier insert');
select is((select count(*) from public.facebook_inbound_events where provider_key='message:rollback'),0::bigint,'earlier event rolled back');
select is((select count(*) from public.business_jobs j join public.facebook_inbound_events e on e.id=j.entity_id where e.page_id='10000000001'),2::bigint,'earlier job rolled back with event');
select throws_ok($$select public.ingest_facebook_events('a0000000-0000-0000-0000-000000000001','10000000001','{}')$$,'22023','invalid_facebook_batch','non-array rejected');
select * from finish();
rollback;
