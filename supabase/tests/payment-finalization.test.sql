-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','finalize_vnpay_ipn',array['text','text','bigint','text','text','text','text','text'],'finalize ipn exists');
select ok(not has_table_privilege('anon','public.vnpay_ipn_receipts','SELECT'),'anonymous cannot read ipn receipts');
select ok(not has_table_privilege('authenticated','public.payment_exceptions','SELECT'),'browser cannot read payment exceptions');
select ok(not has_function_privilege('anon','public.finalize_vnpay_ipn(text,text,bigint,text,text,text,text,text)','EXECUTE'),'anonymous cannot finalize payment');
select ok(not has_function_privilege('authenticated','public.finalize_vnpay_ipn(text,text,bigint,text,text,text,text,text)','EXECUTE'),'browser cannot finalize payment');
insert into public.organizations(id,name,slug) values('a2400000-0000-4000-8000-000000000001','Pay fixture','pay-test-fixture');
insert into auth.users(id) values('b2400000-0000-4000-8000-000000000001');
insert into public.staff_profiles(user_id,organization_id,role,active) values('b2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','manager',true);
insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality) values
('c2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','Fixture','urn:test:pay-one','urn:test:pay-one','Keyboard','KB-24',100000,2,true,'partial'),
('c2400000-0000-4000-8000-000000000002','a2400000-0000-4000-8000-000000000001','Fixture','urn:test:pay-two','urn:test:pay-two','Mouse','MS-24',50000,1,true,'partial'),
('c2400000-0000-4000-8000-000000000003','a2400000-0000-4000-8000-000000000001','Fixture','urn:test:pay-late','urn:test:pay-late','Cable','CB-24',30000,1,true,'partial'),
('c2400000-0000-4000-8000-000000000004','a2400000-0000-4000-8000-000000000001','Fixture','urn:test:pay-fail','urn:test:pay-fail','Pad','PD-24',20000,1,true,'partial');
insert into public.order_shipping_settings(organization_id,flat_fee_vnd) values('a2400000-0000-4000-8000-000000000001',20000);
create function pg_temp.quote(order_id uuid, request uuid, product uuid, price integer) returns void language plpgsql as $$
begin
 perform public.save_staff_order_draft('a2400000-0000-4000-8000-000000000001','b2400000-0000-4000-8000-000000000001',order_id,request,0,
  json_build_object('buyerName','Buyer','phone','+84900000024','address',json_build_object('line1','12 Test','ward',null,'district',null,'province','Ha Noi','countryCode','VN'),
   'items',json_build_array(json_build_object('productId',product,'variantId',null,'quantity',1)))::jsonb);
 insert into public.order_confirmation_quotes(request_id,organization_id,order_id,revision,quote)
 select request,'a2400000-0000-4000-8000-000000000001',order_id,o.revision,public.internal_order_snapshot('a2400000-0000-4000-8000-000000000001',order_id) from public.orders o where o.id=order_id;
end $$;
select pg_temp.quote('d2400000-0000-4000-8000-000000000001','e2400000-0000-4000-8000-000000000001','c2400000-0000-4000-8000-000000000001',100000);
select pg_temp.quote('d2400000-0000-4000-8000-000000000002','e2400000-0000-4000-8000-000000000002','c2400000-0000-4000-8000-000000000002',50000);
select pg_temp.quote('d2400000-0000-4000-8000-000000000003','e2400000-0000-4000-8000-000000000003','c2400000-0000-4000-8000-000000000003',30000);
select pg_temp.quote('d2400000-0000-4000-8000-000000000004','e2400000-0000-4000-8000-000000000004','c2400000-0000-4000-8000-000000000004',20000);
set local role service_role;
select lives_ok($$select public.begin_payment('a2400000-0000-4000-8000-000000000001','d2400000-0000-4000-8000-000000000001',1,'e2400000-0000-4000-8000-000000000011')$$,'begin paid path');
select lives_ok($$select public.begin_payment('a2400000-0000-4000-8000-000000000001','d2400000-0000-4000-8000-000000000002',1,'e2400000-0000-4000-8000-000000000012')$$,'begin duplicate path');
select lives_ok($$select public.begin_payment('a2400000-0000-4000-8000-000000000001','d2400000-0000-4000-8000-000000000003',1,'e2400000-0000-4000-8000-000000000013')$$,'begin late path');
select lives_ok($$select public.begin_payment('a2400000-0000-4000-8000-000000000001','d2400000-0000-4000-8000-000000000004',1,'e2400000-0000-4000-8000-000000000014')$$,'begin fail path');
select lives_ok($$select public.persist_vnpay_checkout('a2400000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000011'),replace((select id::text from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000011'),'-',''),'A24TMN01',(select frozen_total_vnd from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000011'),'20260912120000','20260912121500','127.0.0.1','sandbox.vnpayment.vn')$$,'persist paid checkout');
select lives_ok($$select public.persist_vnpay_checkout('a2400000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000012'),replace((select id::text from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000012'),'-',''),'A24TMN01',(select frozen_total_vnd from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000012'),'20260912120000','20260912121500','127.0.0.1','sandbox.vnpayment.vn')$$,'persist duplicate checkout');
select lives_ok($$select public.persist_vnpay_checkout('a2400000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000013'),replace((select id::text from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000013'),'-',''),'A24TMN01',(select frozen_total_vnd from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000013'),'20260912120000','20260912121500','127.0.0.1','sandbox.vnpayment.vn')$$,'persist late checkout');
select lives_ok($$select public.persist_vnpay_checkout('a2400000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000014'),replace((select id::text from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000014'),'-',''),'A24TMN01',(select frozen_total_vnd from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000014'),'20260912120000','20260912121500','127.0.0.1','sandbox.vnpayment.vn')$$,'persist fail checkout');
select is((select public.finalize_vnpay_ipn('missingref1','A24TMN01',12000000,'VND','00','00','14226112',repeat('a',64))->>'RspCode'),'01','AT-024-01 unknown ref');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'B24TMN99',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'VND','00','00','14226112',repeat('b',64))->>'RspCode'),'01','AT-024-01 merchant mismatch');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'A24TMN01',1,'VND','00','00','14226112',repeat('c',64))->>'RspCode'),'04','AT-024-01 amount mismatch');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'USD','00','00','14226112',repeat('d',64))->>'RspCode'),'04','AT-024-01 currency mismatch');
select is((select payment_status from public.orders where id='d2400000-0000-4000-8000-000000000001'),'UNPAID','AT-024-01 no paid mutation');
select is((select status from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000011'),'ACTIVE','AT-024-01 attempt stays active');
select is((select stock_quantity from public.products where id='c2400000-0000-4000-8000-000000000001'),2,'AT-024-01 physical unchanged');
select is((select count(*) from public.vnpay_ipn_receipts where organization_id='a2400000-0000-4000-8000-000000000001'),0::bigint,'AT-024-01 no receipt');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'VND','00','00','14226112',repeat('e',64))->>'RspCode'),'00','success ipn');
select is((select payment_status from public.orders where id='d2400000-0000-4000-8000-000000000001'),'PAID','success marks paid');
select is((select fulfilment_status from public.orders where id='d2400000-0000-4000-8000-000000000001'),'PREPARING','success prepares');
select is((select reconciliation from public.orders where id='d2400000-0000-4000-8000-000000000001'),'NONE','in-window has no exception');
select is((select status from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000011'),'CONSUMED','consume_inventory_attempt used');
select is((select stock_quantity from public.products where id='c2400000-0000-4000-8000-000000000001'),1,'physical decremented once');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'VND','00','00','14226112',repeat('e',64))->>'RspCode'),'02','AT-024-02 identical replay');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'VND','00','00','14226199',repeat('f',64))->>'RspCode'),'02','AT-024-02 different payload rejected');
select is((select count(*) from public.vnpay_ipn_receipts where order_id='d2400000-0000-4000-8000-000000000001'),1::bigint,'AT-024-02 one receipt');
select is((select count(*) from public.audit_events where entity_id='d2400000-0000-4000-8000-000000000001' and action='order.payment_paid'),1::bigint,'AT-024-02 one paid audit');
select is((select stock_quantity from public.products where id='c2400000-0000-4000-8000-000000000001'),1,'AT-024-02 no second consume');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000001'),'VND','24','02','14226200',repeat('0',64))->>'RspCode'),'02','AT-024-04 failure after success');
select is((select payment_status from public.orders where id='d2400000-0000-4000-8000-000000000001'),'PAID','AT-024-04 no downgrade');
select is((select fulfilment_status from public.orders where id='d2400000-0000-4000-8000-000000000001'),'PREPARING','AT-024-04 stays preparing');
select is((select public.read_vnpay_return((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000002'))->>'paymentStatus'),'UNPAID','AT-024-04 return read stays unpaid');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000002'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000002'),'VND','00','00','14227000',repeat('1',64))->>'RspCode'),'00','second order pays');
reset role;
select is((select public.read_vnpay_return((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000002'))->>'paymentStatus'),'PAID','return reflects ipn paid');
update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where request_id='e2400000-0000-4000-8000-000000000013';
update public.inventory_reservations set expires_at=clock_timestamp()-interval '1 second' where attempt_id=(select id from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000013');
set local role service_role;
select is((select public.expire_inventory_attempt('a2400000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2400000-0000-4000-8000-000000000013'))->>'status'),'released','expire before late ipn');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000003'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000003'),'VND','00','00','14228000',repeat('2',64))->>'outcome'),'MANUAL_REVIEW','AT-024-03 late success');
select is((select fulfilment_status from public.orders where id='d2400000-0000-4000-8000-000000000003'),'EXPIRED','AT-024-03 not preparing');
select is((select payment_status from public.orders where id='d2400000-0000-4000-8000-000000000003'),'PAID','late is paid');
select is((select reconciliation from public.orders where id='d2400000-0000-4000-8000-000000000003'),'MANUAL_REVIEW','late exception');
select is((select stock_quantity from public.products where id='c2400000-0000-4000-8000-000000000003'),1,'late does not consume');
select is((select count(*) from public.payment_exceptions where order_id='d2400000-0000-4000-8000-000000000003'),1::bigint,'manager exception row');
select is((select public.finalize_vnpay_ipn((select txn_ref from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000004'),'A24TMN01',(select amount_vnd*100 from public.vnpay_checkouts where order_id='d2400000-0000-4000-8000-000000000004'),'VND','24','02','14229000',repeat('3',64))->>'outcome'),'FAILED','failure recorded');
select is((select payment_status from public.orders where id='d2400000-0000-4000-8000-000000000004'),'FAILED','failure not paid');
select is((select fulfilment_status from public.orders where id='d2400000-0000-4000-8000-000000000004'),'AWAITING_PAYMENT','failure does not prepare');
select is((select stock_quantity from public.products where id='c2400000-0000-4000-8000-000000000004'),1,'failure does not consume');
reset role;
select * from finish();
rollback;
