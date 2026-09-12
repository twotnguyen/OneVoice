begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_function('public','lookup_consultation_evidence',array['uuid','jsonb'],'atomic structured evidence read');
select ok(not has_function_privilege('authenticated','public.lookup_consultation_evidence(uuid,jsonb)','execute'),'browser cannot choose organization scope');
insert into public.products(id,organization_id,source_url,canonical_url,name,sku,price_vnd,in_stock,stock_quantity,quality,specifications) values
 ('d1600000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','https://fixture.example/parent','https://fixture.example/parent','OV016 Fixture Laptop','PARENT',100,true,999,'usable','[{"name":"RAM","value":"16GB"}]'),
 ('d1600000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','https://fixture.example/unknown','https://fixture.example/unknown','OV016 Fixture Unknown','UNKNOWN',100,true,null,'usable','[]');
insert into public.product_variants(id,product_id,name,sku,price_vnd,in_stock,stock_quantity) values
 ('d1600000-0000-0000-0000-000000000011','d1600000-0000-0000-0000-000000000001','16GB','EXACT',500,true,2),
 ('d1600000-0000-0000-0000-000000000012','d1600000-0000-0000-0000-000000000001','Unknown','UNKNOWN-VARIANT',null,true,null);
create function pg_temp.search_fixture(extra jsonb default '{}') returns jsonb language sql as $$select public.lookup_consultation_evidence('a0000000-0000-0000-0000-000000000001','{"operation":"search_products","need":"OV016 Fixture","brand":"","productType":"","specs":[],"availability":"available","limit":5}'::jsonb||extra)$$;
select is(jsonb_array_length(pg_temp.search_fixture()->'products'),1,'physical known variant only; parent and unknown buckets excluded');
select is(pg_temp.search_fixture()#>>'{products,0,variantId}','d1600000-0000-0000-0000-000000000011','exact variant identity');
select is(pg_temp.search_fixture()#>>'{products,0,priceVnd}','500','variant price overrides no parent fallback');
select is(pg_temp.search_fixture()#>>'{products,0,stockQuantity}','2','variant quantity not duplicated parent999');
select is(jsonb_array_length(pg_temp.search_fixture('{"maxPriceVnd":200}')->'products'),0,'budget uses sellable price, not parent display price');
select is(jsonb_array_length(pg_temp.search_fixture('{"availability":"any"}')->'products'),3,'explicit any can inspect unknowns');
select is((select r->>'priceVnd' from jsonb_array_elements(pg_temp.search_fixture('{"availability":"any"}')->'products') r where r->>'variantId'='d1600000-0000-0000-0000-000000000012'),null::text,'unknown variant price does not inherit parent price');
select is(jsonb_array_length(pg_temp.search_fixture('{"specs":[{"name":"RAM","value":"16GB"}]}')->'products'),1,'bounded spec filter matches exact product');
update public.products set specifications=(select jsonb_agg(jsonb_build_object('name','RAM','value',case when i=101 then '32GB' else '16GB' end)) from generate_series(1,101)i) where id='d1600000-0000-0000-0000-000000000001';
select is(jsonb_array_length(pg_temp.search_fixture('{"specs":[{"name":"RAM","value":"16GB"}]}')->'products'),0,'hidden 101st conflict cannot match verified spec');
select is(pg_temp.search_fixture()#>>'{products,0,specificationsComplete}','false','oversized specification set explicitly incomplete');
select is(pg_temp.search_fixture()#>'{products,0,specifications}','[]'::jsonb,'no partial specification facts exposed');
update public.products set specifications='[{"name":"RAM","value":"16GB"}]' where id='d1600000-0000-0000-0000-000000000001';
update public.product_variants set options=(select jsonb_object_agg('option'||i,'value') from generate_series(1,21)i) where id='d1600000-0000-0000-0000-000000000011';
select is(jsonb_array_length(pg_temp.search_fixture('{"specs":[{"name":"RAM","value":"16GB"}]}')->'products'),0,'incomplete variant options cannot verify inherited specs');
update public.product_variants set options=null where id='d1600000-0000-0000-0000-000000000011';
update public.product_variants set options='{"RAM":"32GB"}' where id='d1600000-0000-0000-0000-000000000011';
select is(jsonb_array_length(pg_temp.search_fixture('{"specs":[{"name":"RAM","value":"16GB"}]}')->'products'),0,'conflicting variant/product spec cannot satisfy a requested spec');
update public.product_variants set options=null,disabled_at=statement_timestamp() where id='d1600000-0000-0000-0000-000000000011';
select is(jsonb_array_length(pg_temp.search_fixture()->'products'),0,'disabled variant never falls back to parent bucket');
update public.product_variants set disabled_at=null where id='d1600000-0000-0000-0000-000000000011';
select is(jsonb_array_length(pg_temp.search_fixture('{"need":"% OR 1=1;--"}')->'products'),0,'query punctuation remains a literal, not SQL/wildcard');
select throws_ok($$select pg_temp.search_fixture('{"organizationId":"injected"}')$$,'22023','EVIDENCE_INVALID','unknown parameters rejected in SQL');
select is(public.lookup_consultation_evidence('a0000000-0000-0000-0000-000000000001','{"operation":"compare_products","items":[{"productId":"d1600000-0000-0000-0000-000000000001","variantId":"d1600000-0000-0000-0000-000000000011","expectedSku":"WRONG"}]}')->'missing','["identity_or_scope_mismatch"]'::jsonb,'SKU mismatch fails entire comparison');
select is(public.lookup_consultation_evidence(gen_random_uuid(),'{"operation":"compare_products","items":[{"productId":"d1600000-0000-0000-0000-000000000001","variantId":"d1600000-0000-0000-0000-000000000011"}]}')->'products','[]'::jsonb,'cross organization comparison yields no product facts');
select is(public.lookup_consultation_evidence('a0000000-0000-0000-0000-000000000001','{"operation":"compare_products","items":[{"productId":"d1600000-0000-0000-0000-000000000002","variantId":"d1600000-0000-0000-0000-000000000011"}]}')->'products','[]'::jsonb,'variant belonging to different product fails closed');
insert into public.business_policies(id,organization_id,kind,title,body,version,product_ids) values('d1600000-0000-0000-0000-000000000021','a0000000-0000-0000-0000-000000000001','warranty','Fixture warranty','Staff verifies warranty claim',1,array['d1600000-0000-0000-0000-000000000001'::uuid]);
insert into public.promotions(id,organization_id,label,details_text,scope,expires_at) values('d1600000-0000-0000-0000-000000000031','a0000000-0000-0000-0000-000000000001','Expired fixture','Do not quote','all',statement_timestamp()-interval '1 day');
create function pg_temp.guidance_fixture() returns jsonb language sql as $$select public.lookup_consultation_evidence('a0000000-0000-0000-0000-000000000001','{"operation":"read_guidance","productId":"d1600000-0000-0000-0000-000000000001","query":""}')$$;
select ok(exists(select 1 from jsonb_array_elements(pg_temp.guidance_fixture()->'policies') p where p->>'id'='d1600000-0000-0000-0000-000000000021'),'canonical scoped policy present');
select ok(not exists(select 1 from jsonb_array_elements(pg_temp.guidance_fixture()->'promotions') p where p->>'id'='d1600000-0000-0000-0000-000000000031'),'expired promotion never returned');
select ok(pg_temp.guidance_fixture()->>'asOf' is not null,'database supplies asOf');
select * from finish();
rollback;
