-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into public.organizations(id,name,slug) values('a0560000-0000-4000-8000-000000000001','OV-056 fixture','ov056-website-messages');

select has_function('public','ingest_web_event',array['uuid','jsonb'],'ingest_web_event exists');
select has_function('public','take_website_rate_limit',array['text','text','integer','integer'],'take_website_rate_limit exists');
select has_table('public','website_rate_limits','reuse website_rate_limits');
select hasnt_table('public','website_message_rate_limits','no third limiter table');
select ok(not has_table_privilege('anon','public.web_inbound_events','SELECT'),'anonymous cannot read web inbound');
select ok(not has_table_privilege('authenticated','public.web_inbound_events','SELECT'),'browser cannot read web inbound');
select ok(not has_function_privilege('anon','public.ingest_web_event(uuid,jsonb)','EXECUTE'),'browser cannot ingest web events');

set local role service_role;

-- AT-056-01 inbound + inbound_event job; replay does not duplicate.
create temporary table web_send as select public.ingest_web_event('a0560000-0000-4000-8000-000000000001','{"providerKey":"message:req-056-01","senderKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","kind":"message","eventTimeMs":1700000000000,"data":{"text":"xin chao"}}') id;
select is((select public.ingest_web_event('a0560000-0000-4000-8000-000000000001','{"providerKey":"message:req-056-01","senderKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","kind":"message","eventTimeMs":1700000000000,"data":{"text":"xin chao"}}')), (select id from web_send), 'AT-056-01 replay returns same event');
select is((select count(*) from public.web_inbound_events where organization_id='a0560000-0000-4000-8000-000000000001' and provider_key='message:req-056-01'), 1::bigint, 'AT-056-01 one inbound row');
select is((select count(*) from public.business_jobs where organization_id='a0560000-0000-4000-8000-000000000001' and kind='inbound_event' and entity_id=(select id from web_send)), 1::bigint, 'AT-056-01 one inbound_event job');
select is((select count(*) from public.messenger_outbox where organization_id='a0560000-0000-4000-8000-000000000001'), 0::bigint, 'AT-056-05 no messenger_outbox for web ingest');

-- AT-056-02 cross-session isolation by sender_key.
create temporary table web_other as select public.ingest_web_event('a0560000-0000-4000-8000-000000000001','{"providerKey":"message:req-056-02","senderKey":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","kind":"message","eventTimeMs":1700000001000,"data":{"text":"other"}}') id;
select is((select count(*) from public.web_inbound_events where organization_id='a0560000-0000-4000-8000-000000000001' and sender_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 1::bigint, 'AT-056-02 session A inbound isolated');
select is((select count(*) from public.web_inbound_events where organization_id='a0560000-0000-4000-8000-000000000001' and sender_key='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 1::bigint, 'AT-056-02 session B inbound isolated');
select isnt((select id from web_send), (select id from web_other), 'AT-056-02 distinct events');

-- AT-056-03 persisted send limiter (message_send scope on website_rate_limits).
select ok(public.take_website_rate_limit('message_send', repeat('c',64), 20, 60000), 'AT-056-03 send 1');
select ok((select bool_and(public.take_website_rate_limit('message_send', repeat('c',64), 20, 60000)) from generate_series(2,20)), 'AT-056-03 send 2-20');
select ok(not public.take_website_rate_limit('message_send', repeat('c',64), 20, 60000), 'AT-056-03 21st send blocked');
select ok(not public.take_website_rate_limit('message_send', repeat('c',64), 20, 60000), 'AT-056-03 still blocked after new call');
select is((select hit_count from public.website_rate_limits where scope='message_send' and client_key=repeat('c',64)), 20, 'AT-056-03 limiter row persisted');
select ok((select client_key from public.website_rate_limits where scope='message_send' and client_key=repeat('c',64)) ~ '^[0-9a-f]{64}$', 'AT-056-03 client_key is hashed');
select is((select count(*) from public.website_rate_limits where scope='message_send' and client_key=repeat('c',64)), 1::bigint, 'AT-056-03 one send-scope row');

-- AT-056-04 private notes never stored as inbound kind; public data is text only.
select is((select data from public.web_inbound_events where id=(select id from web_send)), '{"text":"xin chao"}'::jsonb, 'AT-056-04 inbound data is public text');
select ok(not exists(select 1 from public.web_inbound_events where organization_id='a0560000-0000-4000-8000-000000000001' and data::text like '%SECRET_NOTE%'), 'AT-056-04 no private notes in inbound');
select is((select count(*) from public.business_jobs where organization_id='a0560000-0000-4000-8000-000000000001' and kind='outbound_message'), 0::bigint, 'AT-056-05 no outbound_message job');
select ok((select data ? 'text' and not data ? 'psid' and not data ? 'pageId' and not data ? 'page_id' from public.web_inbound_events where id=(select id from web_send)), 'AT-056-05 inbound has text without page/psid');

reset role;
select * from finish();
rollback;
