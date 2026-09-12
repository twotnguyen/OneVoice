-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','staff_transition_order',array['uuid','uuid','uuid','integer','text','uuid','text','text','text'],'staff transition exists');
select has_function('public','list_staff_order_operations',array['uuid','uuid','text','integer'],'staff list exists');
select has_function('public','acknowledge_payment_exception',array['uuid','uuid','uuid','uuid'],'manager ack exists');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~* 'mark.?paid'),'no mark-paid function');
select ok(not has_table_privilege('anon','public.order_fulfilment_history','SELECT'),'anonymous cannot read fulfilment history');
select ok(not has_table_privilege('authenticated','public.order_fulfilment_history','SELECT'),'browser cannot read fulfilment history');
select ok(not has_function_privilege('anon','public.staff_transition_order(uuid,uuid,uuid,integer,text,uuid,text,text,text)','EXECUTE'),'anonymous cannot transition');
select ok(not has_function_privilege('authenticated','public.acknowledge_payment_exception(uuid,uuid,uuid,uuid)','EXECUTE'),'browser cannot ack exceptions');

insert into public.organizations(id,name,slug) values
('a2500000-0000-4000-8000-000000000001','Ops fixture','ops-025'),
('a2500000-0000-4000-8000-000000000099','Foreign ops','ops-025-foreign');
insert into auth.users(id) values
('b2500000-0000-4000-8000-000000000001'),
('b2500000-0000-4000-8000-000000000002'),
('b2500000-0000-4000-8000-000000000099');
insert into public.staff_profiles(user_id,organization_id,role,active) values
('b2500000-0000-4000-8000-000000000001','a2500000-0000-4000-8000-000000000001','staff',true),
('b2500000-0000-4000-8000-000000000002','a2500000-0000-4000-8000-000000000001','manager',true),
('b2500000-0000-4000-8000-000000000099','a2500000-0000-4000-8000-000000000099','staff',true);
insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality) values
('c2500000-0000-4000-8000-000000000001','a2500000-0000-4000-8000-000000000001','Fixture','urn:test:ops-keyboard','urn:test:ops-keyboard','Keyboard','KB-25',100000,5,true,'partial');

insert into public.orders(id,organization_id,revision,created_by_kind,created_by_actor_id,buyer_name,phone,subtotal_vnd,shipping_fee_vnd,shipping_revision,total_vnd)
values
('d2500000-0000-4000-8000-000000000001','a2500000-0000-4000-8000-000000000001',2,'staff','b2500000-0000-4000-8000-000000000001','Ops buyer','+84900000025',100000,20000,1,120000),
('d2500000-0000-4000-8000-000000000002','a2500000-0000-4000-8000-000000000001',2,'staff','b2500000-0000-4000-8000-000000000001','Unpaid buyer','+84900000026',100000,20000,1,120000),
('d2500000-0000-4000-8000-000000000003','a2500000-0000-4000-8000-000000000001',2,'staff','b2500000-0000-4000-8000-000000000001','Late buyer','+84900000027',100000,20000,1,120000),
('d2500000-0000-4000-8000-000000000099','a2500000-0000-4000-8000-000000000099',2,'staff','b2500000-0000-4000-8000-000000000099','Foreign buyer','+84900000099',100000,20000,1,120000);
insert into public.order_items(order_id,line_number,product_id,product_version,name,sku,quantity,unit_price_vnd,line_total_vnd) values
('d2500000-0000-4000-8000-000000000001',1,'c2500000-0000-4000-8000-000000000001',1,'Keyboard','KB-25',1,100000,100000);
update public.orders set checkout_frozen_at=now(),checkout_snapshot='{}'::jsonb,checkout_request_id=id,fulfilment_status='PREPARING',payment_status='PAID',reconciliation='NONE' where id='d2500000-0000-4000-8000-000000000001';
update public.orders set checkout_frozen_at=now(),checkout_snapshot='{}'::jsonb,checkout_request_id=id,fulfilment_status='AWAITING_PAYMENT',payment_status='UNPAID' where id='d2500000-0000-4000-8000-000000000002';
update public.orders set checkout_frozen_at=now(),checkout_snapshot='{}'::jsonb,checkout_request_id=id,fulfilment_status='EXPIRED',payment_status='PAID',reconciliation='MANUAL_REVIEW' where id='d2500000-0000-4000-8000-000000000003';
update public.orders set checkout_frozen_at=now(),checkout_snapshot='{}'::jsonb,checkout_request_id=id,fulfilment_status='PREPARING',payment_status='PAID',reconciliation='NONE' where id='d2500000-0000-4000-8000-000000000099';

insert into public.payment_attempts(id,request_id,organization_id,order_id,expected_version,frozen_total_vnd,currency,status,expires_at,created_at,updated_at)
values('f2500000-0000-4000-8000-000000000003','e2500000-0000-4000-8000-000000000013','a2500000-0000-4000-8000-000000000001','d2500000-0000-4000-8000-000000000003',2,120000,'VND','ACTIVE',now()+interval '15 minutes',now(),now());
insert into public.vnpay_ipn_receipts(id,txn_ref,attempt_id,organization_id,order_id,provider_transaction_no,amount_times_100,curr_code,tmn_code,response_code,transaction_status,payload_digest,outcome)
values('f2500000-0000-4000-8000-000000000013','T025PAYEXC01','f2500000-0000-4000-8000-000000000003','a2500000-0000-4000-8000-000000000001','d2500000-0000-4000-8000-000000000003','14225000',12000000,'VND','A25TMN01','00','00',repeat('a',64),'MANUAL_REVIEW');
insert into public.payment_exceptions(id,organization_id,order_id,attempt_id,receipt_id,reason)
values('f2500000-0000-4000-8000-000000000023','a2500000-0000-4000-8000-000000000001','d2500000-0000-4000-8000-000000000003','f2500000-0000-4000-8000-000000000003','f2500000-0000-4000-8000-000000000013','late_payment');

create function pg_temp.transition(ver integer, dest text, req uuid, target uuid default 'd2500000-0000-4000-8000-000000000001', note text default 'SECRET_NOTE') returns jsonb language sql as $$
 select public.staff_transition_order('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001',target,ver,dest,req,'OV25TRACK','Khách thấy đang giao',note)
$$;

set local role service_role;
select is(public.list_staff_order_operations('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','DELIVERING',1)->>'total','0','AT-025-03 empty list has zero total');
select is(public.list_staff_order_operations('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','DELIVERING',1)->'items','[]'::jsonb,'AT-025-03 empty list is not fake rows');

select throws_ok($$select pg_temp.transition(2,'DELIVERING',gen_random_uuid(),'d2500000-0000-4000-8000-000000000002')$$,'22023','ORDER_TRANSITION','AT-025-01 UNPAID cannot ship');
select throws_ok($$select pg_temp.transition(2,'DELIVERED',gen_random_uuid())$$,'22023','ORDER_TRANSITION','AT-025-01 cannot skip to delivered');
select throws_ok($$select public.staff_transition_order('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','d2500000-0000-4000-8000-000000000003',2,'DELIVERING',gen_random_uuid(),null,'','')$$,'22023','ORDER_TRANSITION','AT-025-01 manual review cannot fulfil');

select lives_ok($$select pg_temp.transition(2,'DELIVERING','e2500000-0000-4000-8000-000000000021')$$,'AT-025-04 first winner PREPARING to DELIVERING');
select lives_ok($$select pg_temp.transition(2,'DELIVERING','e2500000-0000-4000-8000-000000000021')$$,'identical request replays');
select throws_ok($$select pg_temp.transition(2,'DELIVERING','e2500000-0000-4000-8000-000000000022')$$,'40001','ORDER_VERSION_CONFLICT','AT-025-01 stale version loses');
select is((select count(*) from public.order_fulfilment_history where order_id='d2500000-0000-4000-8000-000000000001'),1::bigint,'replay writes one history row');
select is((select fulfilment_status from public.orders where id='d2500000-0000-4000-8000-000000000001'),'DELIVERING','AT-025-04 persisted DELIVERING');
select is((select payment_status from public.orders where id='d2500000-0000-4000-8000-000000000001'),'PAID','AT-025-02 payment unchanged');
select is((select total_vnd from public.orders where id='d2500000-0000-4000-8000-000000000001'),120000::bigint,'AT-025-02 total unchanged');
select is((select unit_price_vnd from public.order_items where order_id='d2500000-0000-4000-8000-000000000001' and line_number=1),100000::bigint,'AT-025-02 catalog line unchanged');

select ok(public.list_staff_order_operations('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','DELIVERING',1)::text not like '%SECRET_NOTE%','AT-025-03 list DTO omits internal notes');
select is(public.read_staff_order_operations('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','d2500000-0000-4000-8000-000000000001')->>'internalNote','SECRET_NOTE','staff detail keeps internal notes');

select lives_ok($$select pg_temp.transition(3,'DELIVERED','e2500000-0000-4000-8000-000000000023')$$,'AT-025-04 DELIVERING to DELIVERED');
select is((select fulfilment_status from public.orders where id='d2500000-0000-4000-8000-000000000001'),'DELIVERED','AT-025-04 persisted DELIVERED');
select throws_ok($$select pg_temp.transition(4,'DELIVERING',gen_random_uuid())$$,'22023','ORDER_TRANSITION','AT-025-01 delivered cannot go back');
select is((select count(*) from public.order_fulfilment_history where order_id='d2500000-0000-4000-8000-000000000001'),2::bigint,'two immutable history versions');

select throws_ok($$select public.staff_transition_order('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000099','d2500000-0000-4000-8000-000000000001',4,'DELIVERING',gen_random_uuid(),null,'','')$$,'42501','ORDER_FORBIDDEN','AT-025-02 foreign actor rejected');
select throws_ok($$select public.read_staff_order_operations('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000099','d2500000-0000-4000-8000-000000000001')$$,'42501','ORDER_FORBIDDEN','AT-025-02 cross-org read rejected');
select is(public.read_staff_order_operations('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','d2500000-0000-4000-8000-000000000099'),null,'foreign order is not visible');

select throws_ok($$select public.list_payment_exceptions('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001')$$,'42501','ORDER_FORBIDDEN','staff cannot list exceptions');
select throws_ok($$select public.acknowledge_payment_exception('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','f2500000-0000-4000-8000-000000000023',gen_random_uuid())$$,'42501','ORDER_FORBIDDEN','staff cannot ack');
select is(jsonb_array_length(public.list_payment_exceptions('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000002')),1,'manager sees late-payment exception');
select lives_ok($$select public.acknowledge_payment_exception('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000023','e2500000-0000-4000-8000-000000000033')$$,'manager acknowledges exception');
select isnt((select acknowledged_at from public.payment_exceptions where id='f2500000-0000-4000-8000-000000000023'),null,'ack persisted');
select lives_ok($$select public.acknowledge_payment_exception('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000023','e2500000-0000-4000-8000-000000000034')$$,'ack is idempotent');

reset role;
select throws_ok($$update public.orders set total_vnd=1 where id='d2500000-0000-4000-8000-000000000001'$$,'55000','ORDER_FROZEN','AT-025-02 frozen totals cannot be edited');
select throws_ok($$update public.order_fulfilment_history set internal_note='changed' where order_id='d2500000-0000-4000-8000-000000000001'$$,'55000',null,'history immutable');
select is((select payment_status from public.orders where id='d2500000-0000-4000-8000-000000000001'),'PAID','paid remains after rejected total write');

update public.staff_profiles set active=false where user_id='b2500000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select pg_temp.transition(4,'DELIVERED','e2500000-0000-4000-8000-000000000021')$$,'42501','ORDER_FORBIDDEN','AT-025-02 inactive staff cannot replay');
select throws_ok($$select public.list_staff_order_operations('a2500000-0000-4000-8000-000000000001','b2500000-0000-4000-8000-000000000001','DELIVERED',1)$$,'42501','ORDER_FORBIDDEN','AT-025-02 inactive staff cannot list');
reset role;
select * from finish();
rollback;
