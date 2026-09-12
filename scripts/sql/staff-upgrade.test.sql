-- SPDX-License-Identifier: Apache-2.0
-- Simulate pre-migration schema ONLY in a rolled-back local test transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
drop table public.staff_profiles;
insert into public.products (id, organization_id, source_url, canonical_url, name, in_stock, quality, price_vnd, stock_quantity)
values ('b0000000-0000-4000-8000-000000000099','a0000000-0000-0000-0000-000000000001','https://example.com/fixture','https://example.com/fixture','Upgrade fixture',true,'usable',12000000,2);
create temporary table catalog_before as select id, to_jsonb(products) as data from public.products;
create temporary table counts_before as select
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.products) as products,
  (select count(*) from public.product_images) as images,
  (select count(*) from public.product_variants) as variants,
  (select count(*) from public.promotions) as promotions;

-- ONEVOICE_STAFF_MIGRATION

select has_table('public','staff_profiles','upgrade creates staff table');
select results_eq('select id,to_jsonb(products) from public.products order by id','select id,data from catalog_before order by id','upgrade preserves exact catalog rows including fixture');
select results_eq('select (select count(*) from public.organizations),(select count(*) from public.products),(select count(*) from public.product_images),(select count(*) from public.product_variants),(select count(*) from public.promotions)','select * from counts_before','upgrade preserves business relation counts');
select * from finish();
rollback;
