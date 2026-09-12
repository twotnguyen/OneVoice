-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','verify_customer_order_status',array['uuid','uuid','text','text','text','text','timestamptz','timestamptz'],'status verify exists');
select has_function('public','read_order_status',array['text','timestamptz'],'status read exists');
select ok(not has_table_privilege('anon','public.status_lookup_rate_windows','SELECT'),'anonymous cannot read rate windows');
select ok(not has_table_privilege('authenticated','public.order_confirmation_tokens','SELECT'),'browser cannot read token hashes');
select is(public.normalize_customer_phone('0900000027'),'+84900000027','national phone normalizes');
select is(public.normalize_customer_phone('+84 900.000.027'),'+84900000027','plus-84 phone normalizes');

insert into public.organizations(id,name,slug) values('a2700000-0000-4000-8000-000000000001','Status fixture','status-027');
insert into auth.users(id) values('b2700000-0000-4000-8000-000000000001');
insert into public.staff_profiles(user_id,organization_id,role,active) values('b2700000-0000-4000-8000-000000000001','a2700000-0000-4000-8000-000000000001','staff',true);
insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality)
 values('c2700000-0000-4000-8000-000000000001','a2700000-0000-4000-8000-000000000001','Fixture','urn:test:status','urn:test:status','Fixture laptop','FIX-27',150000,2,true,'partial');
insert into public.conversations(id,organization_id,channel,channel_user_key) values
('d2700000-0000-4000-8000-000000000001','a2700000-0000-4000-8000-000000000001','WEB','web-session-a'),
('d2700000-0000-4000-8000-000000000002','a2700000-0000-4000-8000-000000000001','WEB','web-session-b');
insert into public.conversations(id,organization_id,page_id,psid) values
('d2700000-0000-4000-8000-000000000003','a2700000-0000-4000-8000-000000000001','10000000027','20000000027'),
('d2700000-0000-4000-8000-000000000004','a2700000-0000-4000-8000-000000000001','10000000027','20000000028'),
('d2700000-0000-4000-8000-000000000005','a2700000-0000-4000-8000-000000000001','10000000028','20000000027');
insert into public.orders(id,organization_id,created_by_kind,created_by_actor_id,conversation_id,buyer_name,phone,subtotal_vnd,shipping_fee_vnd,total_vnd)
 values
('e2700000-0000-4000-8000-000000000001','a2700000-0000-4000-8000-000000000001','staff','b2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000001','Buyer A','+84900000027',150000,0,150000),
('e2700000-0000-4000-8000-000000000002','a2700000-0000-4000-8000-000000000001','staff','b2700000-0000-4000-8000-000000000001',null,'Legacy','+84900000027',150000,0,150000),
('e2700000-0000-4000-8000-000000000003','a2700000-0000-4000-8000-000000000001','staff','b2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','Buyer B','+84900000027',150000,0,150000),
('e2700000-0000-4000-8000-000000000004','a2700000-0000-4000-8000-000000000001','staff','b2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000003','Buyer FB','+84900000027',150000,0,150000);
insert into public.order_items(order_id,line_number,product_id,product_version,name,sku,quantity,unit_price_vnd,line_total_vnd) values
('e2700000-0000-4000-8000-000000000001',1,'c2700000-0000-4000-8000-000000000001',1,'Fixture laptop','FIX-27',1,150000,150000),
('e2700000-0000-4000-8000-000000000002',1,'c2700000-0000-4000-8000-000000000001',1,'Fixture laptop','FIX-27',1,150000,150000),
('e2700000-0000-4000-8000-000000000003',1,'c2700000-0000-4000-8000-000000000001',1,'Fixture laptop','FIX-27',1,150000,150000),
('e2700000-0000-4000-8000-000000000004',1,'c2700000-0000-4000-8000-000000000001',1,'Fixture laptop','FIX-27',1,150000,150000);
update public.orders set checkout_frozen_at=clock_timestamp(),checkout_snapshot='{}'::jsonb,checkout_request_id=id,payment_status='PAID',fulfilment_status='DELIVERED',customer_visible_progress='Đang đóng gói',internal_note='SECRET_NOTE',tracking_ref='VN270'
 where id in ('e2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000003','e2700000-0000-4000-8000-000000000004');
select public.save_warranty_case('a2700000-0000-4000-8000-000000000001','b2700000-0000-4000-8000-000000000001','f2700000-0000-4000-8000-000000000001','f2700000-0000-4000-8000-000000000011',0,'e2700000-0000-4000-8000-000000000001',1,'RECEIVED','Đã nhận máy','PRIVATE staff');
select public.save_warranty_case('a2700000-0000-4000-8000-000000000001','b2700000-0000-4000-8000-000000000001','f2700000-0000-4000-8000-000000000001','f2700000-0000-4000-8000-000000000012',1,'e2700000-0000-4000-8000-000000000001',1,'INSPECTING','Đang kiểm tra nguồn','PRIVATE staff');
select public.save_warranty_case('a2700000-0000-4000-8000-000000000001','b2700000-0000-4000-8000-000000000001','f2700000-0000-4000-8000-000000000002','f2700000-0000-4000-8000-000000000013',0,'e2700000-0000-4000-8000-000000000003',1,'RECEIVED','Máy người khác','OTHER PRIVATE');

select is((select psid from public.conversations where id='d2700000-0000-4000-8000-000000000001'),null::text,'WEB session has no PSID');
select is((select page_id from public.conversations where id='d2700000-0000-4000-8000-000000000001'),null::text,'WEB session has no page id');

set local role service_role;
create temporary table verified(result jsonb);
insert into verified select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000001','0900000027','http://verified.test',repeat('a',64),clock_timestamp()+interval '30 minutes');
select is((select result->>'ok' from verified),'true','AT-027-01 WEB session+code+phone verifies without PSID');
select ok((select result::text not like '%SECRET_NOTE%' from verified),'verified DTO omits internal notes');
select ok((select result::text not like '%PRIVATE%' from verified),'verified DTO omits warranty private notes');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000001','0900000027','http://neg.test',repeat('b',64),clock_timestamp()+interval '30 minutes')),jsonb_build_object('ok',false,'code','UNVERIFIED'),'wrong session same shape');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000001','+84900000999','http://neg.test',repeat('c',64),clock_timestamp()+interval '30 minutes')),jsonb_build_object('ok',false,'code','UNVERIFIED'),'wrong phone same shape');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000099','0900000027','http://neg.test',repeat('d',64),clock_timestamp()+interval '30 minutes')),jsonb_build_object('ok',false,'code','UNVERIFIED'),'unknown order same shape');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000002','0900000027','http://neg.test',repeat('e',64),clock_timestamp()+interval '30 minutes')),jsonb_build_object('ok',false,'code','HANDOFF'),'unbound legacy hands off');
select is((select conversation_id from public.orders where id='e2700000-0000-4000-8000-000000000002'),null::uuid,'unbound order is not auto-bound');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000004','e2700000-0000-4000-8000-000000000004','0900000027','http://fb.test',repeat('f',64),clock_timestamp()+interval '30 minutes')),jsonb_build_object('ok',false,'code','UNVERIFIED'),'wrong Facebook PSID is unverified');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000003','e2700000-0000-4000-8000-000000000004','0900000027','http://fb.test',repeat('1',64),clock_timestamp()+interval '30 minutes')->>'ok'),'true','matching Facebook page+psid adapter verifies');

select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000099','0900000027','https://guess.test',repeat('g',64),clock_timestamp()+interval '30 minutes')->>'code'),'UNVERIFIED','guess 1');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000099','0900000027','https://guess.test',repeat('h',64),clock_timestamp()+interval '30 minutes')->>'code'),'UNVERIFIED','guess 2');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000099','0900000027','https://guess.test',repeat('i',64),clock_timestamp()+interval '30 minutes')->>'code'),'UNVERIFIED','guess 3');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000099','0900000027','https://guess.test',repeat('j',64),clock_timestamp()+interval '30 minutes')->>'code'),'UNVERIFIED','guess 4');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000099','0900000027','https://guess.test',repeat('k',64),clock_timestamp()+interval '30 minutes')->>'code'),'UNVERIFIED','guess 5');
select is((select public.verify_customer_order_status('a2700000-0000-4000-8000-000000000001','d2700000-0000-4000-8000-000000000002','e2700000-0000-4000-8000-000000000003','0900000027','https://guess.test',repeat('l',64),clock_timestamp()+interval '30 minutes')),jsonb_build_object('ok',false,'code','RATE_LIMITED'),'AT-027-02 sixth guess rate limited even if order exists');
select ok((select attempt_count>=6 from public.status_lookup_rate_windows where organization_id='a2700000-0000-4000-8000-000000000001' and origin_hash=encode(sha256(convert_to('https://guess.test','UTF8')),'hex')),'AT-027-02 rate window persisted after restart-equivalent reconnect');

select ok((select public.read_order_status(repeat('a',64))::text not like '%SECRET_NOTE%'),'AT-027-03 token read omits internal notes');
select ok((select public.read_order_status(repeat('a',64))::text not like '%PRIVATE%'),'AT-027-03 token read omits private warranty notes');
select ok((select public.read_order_status(repeat('a',64))::text like '%Đang kiểm tra nguồn%'),'AT-027-03 own warranty customer progress visible');
select ok((select public.read_order_status(repeat('a',64))::text not like '%Máy người khác%'),'AT-027-03 other customer warranty excluded');
select is((select public.read_order_status(repeat('z',64))),null,'invalid status token is generic null');

reset role;
insert into public.order_confirmation_tokens(token_hash,organization_id,order_id,purpose,request_id,expires_at)
 values(repeat('0',64),'a2700000-0000-4000-8000-000000000001','e2700000-0000-4000-8000-000000000001','confirmation',gen_random_uuid(),clock_timestamp()+interval '1 day');
select is((select public.read_order_status(repeat('0',64))),null,'AT-027-04 confirmation token cannot read status');
select is((select public.read_order_confirmation(repeat('a',64))),null,'AT-027-04 status token cannot confirm');
select is((select public.confirm_order_quote(repeat('a',64),gen_random_uuid(),jsonb_build_object('orderVersion',1,'subtotalVnd',1,'shippingFeeVnd',0,'totalVnd',1))),null,'AT-027-04 status token cannot confirm quote');
select is((select public.read_vnpay_checkout_start(repeat('a',64))),null,'AT-027-04 status token cannot pay');

reset role;
select * from finish();
rollback;
