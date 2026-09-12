-- SPDX-License-Identifier: Apache-2.0
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','issue_order_confirmation_token',array['uuid','uuid','uuid','uuid','uuid','integer','jsonb','text','text','timestamptz'],'confirmation issue exists');
select ok(not has_table_privilege('anon','public.order_confirmation_tokens','SELECT'),'anonymous cannot read token hashes');
select ok(not has_table_privilege('authenticated','public.order_confirmation_quotes','SELECT'),'browser cannot read confirmed quotes');
insert into public.organizations(id,name,slug) values('a2100000-0000-4000-8000-000000000001','Confirm fixture','confirm-test-fixture');
insert into auth.users(id) values('b2100000-0000-4000-8000-000000000001'),('b2100000-0000-4000-8000-000000000002');
insert into public.staff_profiles(user_id,organization_id,role,active) values
('b2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','manager',true),
('b2100000-0000-4000-8000-000000000002','a2100000-0000-4000-8000-000000000001','staff',true);
insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,sku,price_vnd,stock_quantity,in_stock,quality) values
('c2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','Fixture','urn:test:confirm-parent','urn:test:confirm-parent','Fixture parent','PARENT-1',100000,10,true,'partial'),
('c2100000-0000-4000-8000-000000000002','a2100000-0000-4000-8000-000000000001','Fixture','urn:test:confirm-variant','urn:test:confirm-variant','Fixture variants','PARENT-V',100000,10,true,'partial');
insert into public.product_variants(id,product_id,name,sku,price_vnd,stock_quantity,in_stock) values('c2100000-0000-4000-8000-000000000003','c2100000-0000-4000-8000-000000000002','Variant','VAR-1',250000,10,true);
insert into public.conversations(id,organization_id,page_id,psid) values('d2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','10000000021','20000000021');
create temporary table confirm_doc(document jsonb);
insert into confirm_doc values('{"buyerName":"Nguyen Van A","phone":"+84900000021","address":{"line1":"12 Test","ward":null,"district":null,"province":"Ha Noi","countryCode":"VN"},"items":[{"productId":"c2100000-0000-4000-8000-000000000001","variantId":null,"quantity":1}]}');
grant select on confirm_doc to service_role;
set local role service_role;
select throws_ok($$select public.save_order_shipping_settings('a2100000-0000-4000-8000-000000000001','b2100000-0000-4000-8000-000000000002',gen_random_uuid(),1,20000)$$,'42501','ORDER_FORBIDDEN','staff cannot patch shipping setting');
select lives_ok($$select public.save_order_shipping_settings('a2100000-0000-4000-8000-000000000001','b2100000-0000-4000-8000-000000000001','e2100000-0000-4000-8000-000000000001',1,20000)$$,'manager configures known shipping fee');
select is((select public.read_order_shipping_settings('a2100000-0000-4000-8000-000000000001','b2100000-0000-4000-8000-000000000001')->>'flatFeeVnd'),'20000','manager can read configured fee');
select lives_ok($$select public.issue_order_confirmation_token('a2100000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001','e2100000-0000-4000-8000-000000000010',0,(select document from confirm_doc),repeat('a',64),'confirmation',clock_timestamp()+interval '1 day')$$,'complete collection issues hashed token');
select is((select fulfilment_status from public.orders where conversation_id='d2100000-0000-4000-8000-000000000001'),'DRAFT','issue does not start fulfilment');
select is((select payment_status from public.orders where conversation_id='d2100000-0000-4000-8000-000000000001'),'UNPAID','issue does not mark paid');
select ok((select public.read_order_confirmation(repeat('a',64)) is not null),'valid token reads snapshot');
select is((select public.read_order_confirmation(repeat('b',64))),null,'unknown token is generic null');
select is((select checkout_frozen_at from public.orders where conversation_id='d2100000-0000-4000-8000-000000000001'),null::timestamptz,'GET/issue does not freeze');
select lives_ok($$select public.confirm_order_quote(repeat('a',64),'e2100000-0000-4000-8000-000000000020',jsonb_build_object('orderVersion',1,'subtotalVnd',100000,'shippingFeeVnd',20000,'totalVnd',120000))$$,'customer confirm persists quote');
select is((select public.confirm_order_quote(repeat('a',64),'e2100000-0000-4000-8000-000000000020',jsonb_build_object('orderVersion',1,'subtotalVnd',100000,'shippingFeeVnd',20000,'totalVnd',120000))->>'status'),'confirmed','double confirm replays one revision');
select is((select count(*) from public.order_confirmation_quotes where order_id=(select id from public.orders where conversation_id='d2100000-0000-4000-8000-000000000001')),1::bigint,'one confirmed revision');
select is((select fulfilment_status from public.orders where conversation_id='d2100000-0000-4000-8000-000000000001'),'DRAFT','confirm does not prepare or reserve');
select lives_ok($$select public.save_customer_order_draft(repeat('a',64),'e2100000-0000-4000-8000-000000000030',(select document||'{"buyerName":"Updated Buyer"}' from confirm_doc))$$,'customer may edit after confirm');
select is((select public.read_confirmed_order_quote('a2100000-0000-4000-8000-000000000001',(select id from public.orders where conversation_id='d2100000-0000-4000-8000-000000000001'))),null,'edit invalidates previous confirmed quote');
update public.products set price_vnd=130000,version=version+1 where id='c2100000-0000-4000-8000-000000000001';
select is((select public.confirm_order_quote(repeat('a',64),'e2100000-0000-4000-8000-000000000040',jsonb_build_object('orderVersion',2,'subtotalVnd',100000,'shippingFeeVnd',20000,'totalVnd',120000))->>'status'),'changed','price change requires reconfirm');
reset role;
select * from finish();
rollback;
