-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into public.organizations(id,name,slug) values('a0550000-0000-4000-8000-000000000001','OV-055 fixture','ov055-website-session');

select has_table('public','website_sessions','website_sessions exists');
select has_table('public','website_rate_limits','website_rate_limits exists');
select has_function('public','create_website_session',array['uuid','text','text','text','integer','integer'],'create_website_session exists');
select has_function('public','read_website_session',array['text'],'read_website_session exists');
select has_function('public','take_website_rate_limit',array['text','text','integer','integer'],'take_website_rate_limit exists');
select hasnt_column('public','website_sessions','token','no plaintext token column');
select hasnt_column('public','website_sessions','cookie','no cookie column');
select hasnt_column('public','website_rate_limits','ip','raw IP is not stored');
select ok(not has_table_privilege('anon','public.website_sessions','SELECT'),'anonymous cannot read session hashes');
select ok(not has_table_privilege('authenticated','public.website_sessions','SELECT'),'browser cannot read session hashes');
select ok(not has_table_privilege('anon','public.website_rate_limits','SELECT'),'anonymous cannot read rate-limit rows');
select ok(not has_function_privilege('anon','public.create_website_session(uuid,text,text,text,integer,integer)','EXECUTE'),'browser cannot create sessions');
select ok(not has_function_privilege('authenticated','public.read_website_session(text)','EXECUTE'),'browser cannot read sessions via RPC');

set local role service_role;

-- AT-055-02 hash at rest; channel_user_key equals token_hash, not a conversation UUID.
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('a',64),repeat('a',64),repeat('c',64),5,60000)->>'channelUserKey'),repeat('a',64),'AT-055-02 channel_user_key is token hash');
select is((select token_hash from public.website_sessions where organization_id='a0550000-0000-4000-8000-000000000001'),repeat('a',64),'AT-055-02 only hash stored');
select is((select channel_user_key from public.website_sessions where token_hash=repeat('a',64)),repeat('a',64),'AT-055-02 mapping token_hash = channel_user_key');
select is((select public.read_website_session(repeat('a',64))->>'channelUserKey'),repeat('a',64),'AT-055-02 read by hash');
select is((select public.read_website_session('a0550000-0000-4000-8000-000000000099')),null,'AT-055-02 conversation UUID is not a token hash');

-- AT-055-03 isolation.
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('b',64),repeat('b',64),repeat('d',64),5,60000)->>'ok'),'true','AT-055-03 second session');
select isnt((select public.read_website_session(repeat('a',64))->>'channelUserKey'),(select public.read_website_session(repeat('b',64))->>'channelUserKey'),'AT-055-03 sessions do not share identity');
select is((select public.read_website_session(repeat('a',64))->>'channelUserKey'),repeat('a',64),'AT-055-03 A reads A');
select is((select public.read_website_session(repeat('b',64))->>'channelUserKey'),repeat('b',64),'AT-055-03 B reads B');
select is((select count(*) from public.website_sessions where organization_id='a0550000-0000-4000-8000-000000000001'),2::bigint,'AT-055-03 two session rows');

select is((select public.read_website_session(gen_random_uuid()::text)),null,'AT-055-03 conversation id does not grant a session');

-- AT-055-04 persisted rate-limit create (same hashed client, new calls still blocked).
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('1',63)||'a',repeat('1',63)||'a',repeat('e',64),5,60000)->>'ok'),'true','AT-055-04 create 1');
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('1',63)||'b',repeat('1',63)||'b',repeat('e',64),5,60000)->>'ok'),'true','AT-055-04 create 2');
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('1',63)||'c',repeat('1',63)||'c',repeat('e',64),5,60000)->>'ok'),'true','AT-055-04 create 3');
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('1',63)||'d',repeat('1',63)||'d',repeat('e',64),5,60000)->>'ok'),'true','AT-055-04 create 4');
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('1',63)||'e',repeat('1',63)||'e',repeat('e',64),5,60000)->>'ok'),'true','AT-055-04 create 5');
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('1',63)||'f',repeat('1',63)||'f',repeat('e',64),5,60000)->>'code'),'RATE_LIMITED','AT-055-04 sixth create blocked');
select is((select public.create_website_session('a0550000-0000-4000-8000-000000000001',repeat('2',64),repeat('2',64),repeat('e',64),5,60000)->>'code'),'RATE_LIMITED','AT-055-04 still blocked after new call (process restart)');
select is((select hit_count from public.website_rate_limits where scope='session_create' and client_key=repeat('e',64)),5,'AT-055-04 limiter row persisted');
select is((select count(*) from public.website_sessions where token_hash=repeat('1',63)||'f'),0::bigint,'AT-055-04 limited create inserts no row');
select ok((select client_key from public.website_rate_limits where client_key=repeat('e',64)) ~ '^[0-9a-f]{64}$','AT-055-04 client_key is hashed');

reset role;
select throws_ok($$insert into public.website_sessions(token_hash,organization_id,channel_user_key) values(repeat('3',64),'a0550000-0000-4000-8000-000000000001','a0550000-0000-4000-8000-000000000099')$$,'23514',null,'AT-055-02 channel_user_key must equal token_hash');
select * from finish();
rollback;
