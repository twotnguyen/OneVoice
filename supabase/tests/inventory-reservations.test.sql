-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','begin_payment',array['uuid','uuid','integer','uuid'],'begin payment exists');
select has_function('public','expire_inventory_attempt',array['uuid','uuid'],'expire attempt exists');
select has_function('public','consume_inventory_attempt',array['uuid','uuid'],'consume attempt exists');
select ok(not has_table_privilege('anon','public.payment_attempts','SELECT'),'anonymous cannot read payment attempts');
select ok(not has_table_privilege('authenticated','public.inventory_reservations','SELECT'),'browser cannot read reservations');
select ok(not has_function_privilege('anon','public.begin_payment(uuid,uuid,integer,uuid)','EXECUTE'),'anonymous cannot begin payment');
select ok(not has_function_privilege('authenticated','public.consume_inventory_attempt(uuid,uuid)','EXECUTE'),'browser cannot consume stock');
insert into public.organizations(id,name,slug) values('a2200000-0000-4000-8000-000000000001','Reserve fixture','reserve-test-fixture');
insert into auth.users(id) values('b2200000-0000-4000-8000-000000000001');
insert into public.staff_profiles(user_id,organization_id,role,active) values('b2200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001','manager',true);
insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality) values
('c2200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001','Fixture','urn:test:reserve-parent','urn:test:reserve-parent','Keyboard','KB-1',100000,1,true,'partial'),
('c2200000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000001','Fixture','urn:test:reserve-two','urn:test:reserve-two','Mouse','MS-1',50000,0,true,'partial'),
('c2200000-0000-4000-8000-000000000003','a2200000-0000-4000-8000-000000000001','Fixture','urn:test:reserve-unknown','urn:test:reserve-unknown','Unknown','UN-1',100000,null,true,'partial'),
('c2200000-0000-4000-8000-000000000004','a2200000-0000-4000-8000-000000000001','Fixture','urn:test:reserve-variant','urn:test:reserve-variant','Headset','HS-1',200000,2,true,'partial');
insert into public.product_variants(id,product_id,name,sku,price_vnd,stock_quantity,in_stock) values('c2200000-0000-4000-8000-000000000005','c2200000-0000-4000-8000-000000000004','Black','HS-B',200000,2,true);
insert into public.order_shipping_settings(organization_id,flat_fee_vnd) values('a2200000-0000-4000-8000-000000000001',20000);
create temporary table reserve_doc(kind text primary key, document jsonb);
insert into reserve_doc values
('one','{"buyerName":"Buyer","phone":"+84900000022","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"c2200000-0000-4000-8000-000000000001","variantId":null,"quantity":1}]}'),
('two','{"buyerName":"Buyer","phone":"+84900000022","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"c2200000-0000-4000-8000-000000000001","variantId":null,"quantity":1},{"productId":"c2200000-0000-4000-8000-000000000002","variantId":null,"quantity":1}]}'),
('unknown','{"buyerName":"Buyer","phone":"+84900000022","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"c2200000-0000-4000-8000-000000000003","variantId":null,"quantity":1}]}'),
('variant','{"buyerName":"Buyer","phone":"+84900000022","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"c2200000-0000-4000-8000-000000000004","variantId":"c2200000-0000-4000-8000-000000000005","quantity":1}]}');
grant select on reserve_doc to service_role;
create function pg_temp.quote(order_id uuid, request uuid, doc_kind text) returns void language plpgsql as $$
begin
 perform public.save_staff_order_draft('a2200000-0000-4000-8000-000000000001','b2200000-0000-4000-8000-000000000001',order_id,request,0,(select document from reserve_doc where reserve_doc.kind=doc_kind));
 insert into public.order_confirmation_quotes(request_id,organization_id,order_id,revision,quote)
 select request,'a2200000-0000-4000-8000-000000000001',order_id,o.revision,public.internal_order_snapshot('a2200000-0000-4000-8000-000000000001',order_id) from public.orders o where o.id=order_id;
end $$;
select pg_temp.quote('d2200000-0000-4000-8000-000000000001','e2200000-0000-4000-8000-000000000001','one');
select pg_temp.quote('d2200000-0000-4000-8000-000000000002','e2200000-0000-4000-8000-000000000002','one');
select pg_temp.quote('d2200000-0000-4000-8000-000000000003','e2200000-0000-4000-8000-000000000003','two');
select pg_temp.quote('d2200000-0000-4000-8000-000000000004','e2200000-0000-4000-8000-000000000004','unknown');
select pg_temp.quote('d2200000-0000-4000-8000-000000000005','e2200000-0000-4000-8000-000000000005','variant');
select is((select count(*) from public.inventory_reservations where organization_id='a2200000-0000-4000-8000-000000000001'),0::bigint,'confirm/quote does not reserve');
select is((select checkout_frozen_at from public.orders where id='d2200000-0000-4000-8000-000000000001'),null::timestamptz,'quote does not freeze');
set local role service_role;
select throws_ok($$select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000003',1,gen_random_uuid())$$,'22023','ORDER_STOCK_UNAVAILABLE','AT-022-02 missing SKU rejects the hold');
select is((select count(*) from public.payment_attempts where organization_id='a2200000-0000-4000-8000-000000000001'),0::bigint,'AT-022-02 no attempt after partial failure');
select is((select count(*) from public.inventory_reservations where organization_id='a2200000-0000-4000-8000-000000000001'),0::bigint,'AT-022-02 no reservation after partial failure');
select is((select checkout_frozen_at from public.orders where id='d2200000-0000-4000-8000-000000000003'),null::timestamptz,'AT-022-02 freeze rolled back');
select throws_ok($$select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000004',1,gen_random_uuid())$$,'22023','ORDER_STOCK_UNKNOWN','AT-022-05 unknown stock cannot checkout');
select lives_ok($$select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000001',1,'e2200000-0000-4000-8000-000000000011')$$,'last unit reserves');
select is((select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000001',1,'e2200000-0000-4000-8000-000000000011')->>'attemptId'),(select id::text from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000011'),'AT-022-03 replay returns the same attempt');
select throws_ok($$select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000001',2,'e2200000-0000-4000-8000-000000000011')$$,'40001','ORDER_REQUEST_CONFLICT','AT-022-03 conflict payload rejected');
select throws_ok($$select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000002',1,gen_random_uuid())$$,'22023','ORDER_STOCK_UNAVAILABLE','sequential last unit rejects the second customer');
select is((select count(*) from public.payment_attempts where organization_id='a2200000-0000-4000-8000-000000000001' and status='ACTIVE'),1::bigint,'one active attempt');
select is((select stock_quantity from public.products where id='c2200000-0000-4000-8000-000000000001'),1,'physical is unchanged while reserved');
select is((select coalesce(sum(quantity),0) from public.inventory_reservations where product_id='c2200000-0000-4000-8000-000000000001' and variant_id is null and state='ACTIVE'),1::bigint,'one unit actively reserved');
select ok((select expires_at-created_at=interval '15 minutes' from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000011'),'expiry is fifteen minutes on the database clock');
select is((select fulfilment_status from public.orders where id='d2200000-0000-4000-8000-000000000001'),'AWAITING_PAYMENT','begin payment starts checkout');
reset role;
select throws_ok($$update public.products set stock_quantity=0 where id='c2200000-0000-4000-8000-000000000001'$$,'22023','CATALOG_STOCK_RESERVED','AT-022-05 import cannot drop below reserved');
set local role service_role;
select lives_ok($$select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000005',1,'e2200000-0000-4000-8000-000000000015')$$,'variant SKU reserves');
reset role;
select lives_ok($$select public.save_catalog_product('a2200000-0000-4000-8000-000000000001','b2200000-0000-4000-8000-000000000001',gen_random_uuid(),'c2200000-0000-4000-8000-000000000004',1,'{"name":"Headset","sku":"HS-1","brand":null,"productType":"headset","descriptionText":null,"priceVnd":200000,"stockQuantity":2,"inStock":true,"active":true,"specifications":[],"images":[],"variants":[{"id":"c2200000-0000-4000-8000-000000000005","name":"Black","sku":"HS-B","priceVnd":200000,"stockQuantity":2,"inStock":true,"active":false,"imageUrl":null}]}')$$,'AT-022-05 disable variant with active reserve');
select is((select state from public.inventory_reservations where order_id='d2200000-0000-4000-8000-000000000005'),'ACTIVE','disabled variant keeps the reservation');
select throws_ok($$update public.product_variants set stock_quantity=0 where id='c2200000-0000-4000-8000-000000000005'$$,'22023','CATALOG_STOCK_RESERVED','disabled variant cannot drop below reserved');
set local role service_role;
select is((select public.expire_inventory_attempt('a2200000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000011'))->>'status'),'active','in-window expire is a no-op');
reset role;
update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where request_id='e2200000-0000-4000-8000-000000000011';
set local role service_role;

select is((select public.expire_inventory_attempt('a2200000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000011'))->>'status'),'released','due expire releases');
select is((select public.expire_inventory_attempt('a2200000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000011'))->>'status'),'released','expire replay is idempotent');
select is((select public.consume_inventory_attempt('a2200000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000011'))->>'status'),'released','late paid cannot consume released stock');
select is((select stock_quantity from public.products where id='c2200000-0000-4000-8000-000000000001'),1,'release does not decrement physical');
select lives_ok($$select public.begin_payment('a2200000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000002',1,'e2200000-0000-4000-8000-000000000012')$$,'released stock can be reserved by another order');
select is((select public.consume_inventory_attempt('a2200000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000012'))->>'status'),'consumed','in-window consume takes physical');
select is((select public.consume_inventory_attempt('a2200000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000012'))->>'status'),'consumed','consume replay is idempotent');
select is((select stock_quantity from public.products where id='c2200000-0000-4000-8000-000000000001'),0,'consumed unit left physical stock');
select is((select public.expire_inventory_attempt('a2200000-0000-4000-8000-000000000001',(select id from public.payment_attempts where request_id='e2200000-0000-4000-8000-000000000012'))->>'status'),'consumed','expire after consume does not release twice');
reset role;
select * from finish();
rollback;
