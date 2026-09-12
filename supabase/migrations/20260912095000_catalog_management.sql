-- SPDX-License-Identifier: Apache-2.0
-- Manual edits retain imported source fields/payload. Physical stock is not reserved stock.
alter table public.products add column version integer not null default 1 check (version > 0),
  add column disabled_at timestamptz, add column manually_edited_at timestamptz;
alter table public.product_variants add column disabled_at timestamptz;
alter table public.product_images add column original_source_url text;
update public.product_images set original_source_url = source_url;
alter table public.products add constraint managed_product_price check (price_vnd is null or price_vnd between 0 and 9007199254740991) not valid;
alter table public.product_variants add constraint managed_variant_price check (price_vnd is null or price_vnd between 0 and 9007199254740991) not valid;
create index products_management_page_idx on public.products(organization_id,updated_at desc,id);

create table public.catalog_product_edits (
  request_id uuid primary key,
  product_id uuid not null references public.products(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null,
  version integer not null,
  expected_version integer not null,
  document jsonb not null,
  source_references jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(product_id,version)
);
alter table public.catalog_product_edits enable row level security;
revoke all on public.catalog_product_edits from public,anon,authenticated,service_role;
grant select,insert on public.catalog_product_edits to service_role;
create policy catalog_edits_server on public.catalog_product_edits for all to service_role using (true) with check (true);
create trigger catalog_edits_no_change before update or delete on public.catalog_product_edits for each row execute function public.reject_audit_mutation();
create trigger catalog_edits_no_truncate before truncate on public.catalog_product_edits for each statement execute function public.reject_audit_mutation();

create function public.save_catalog_product(p_organization_id uuid,p_actor_id uuid,p_request_id uuid,p_product_id uuid,p_expected_version integer,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prior public.catalog_product_edits%rowtype;
  product public.products%rowtype;
  item jsonb;
  new_version integer;
  image_position integer := 0;
  edit_time timestamptz := clock_timestamp();
  prior_sources jsonb;
begin
  -- Hold membership stable through commit; the HTTP guard also verifies Supabase Auth.
  perform 1 from public.staff_profiles where user_id=p_actor_id and organization_id=p_organization_id and active and role='manager' for share;
  if not found then raise exception using errcode='42501',message='CATALOG_FORBIDDEN'; end if;
  if p_request_id is null or p_product_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode='22023',message='CATALOG_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,10));
  select * into prior from public.catalog_product_edits where request_id=p_request_id;
  if found then
    if prior.actor_id<>p_actor_id or prior.organization_id<>p_organization_id or prior.product_id<>p_product_id or prior.expected_version<>p_expected_version or prior.document is distinct from p_document then
      raise exception using errcode='40001',message='CATALOG_REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('productId',p_product_id,'version',prior.version);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text,11));
  select * into product from public.products where id=p_product_id for update;
  if found then
    if product.organization_id<>p_organization_id then raise exception using errcode='42501',message='CATALOG_FORBIDDEN'; end if;
    if product.version<>p_expected_version then raise exception using errcode='40001',message='CATALOG_VERSION_CONFLICT'; end if;
    new_version := product.version+1;
  else
    if p_expected_version<>0 then raise exception using errcode='40001',message='CATALOG_VERSION_CONFLICT'; end if;
    new_version := 1;
  end if;
  prior_sources := jsonb_build_object('sourceName',product.source_name,'sourceUrl',product.source_url,'sourceProductId',product.source_product_id,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sourceUrl',source_url,'originalSourceUrl',original_source_url)) from public.product_images where product_id=p_product_id),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sourceVariantId',source_variant_id)) from public.product_variants where product_id=p_product_id),'[]'::jsonb));
  if p_document is null or jsonb_typeof(p_document)<>'object' or not (p_document ?& array['name','productType','priceVnd','stockQuantity','inStock','active','specifications','images','variants'])
    or length(trim(p_document->>'name')) not between 1 and 300 or length(trim(p_document->>'productType')) not between 1 and 100
    or jsonb_typeof(p_document->'active')<>'boolean' or jsonb_typeof(p_document->'inStock')<>'boolean'
    or jsonb_typeof(p_document->'specifications')<>'array' or jsonb_typeof(p_document->'images')<>'array' or jsonb_typeof(p_document->'variants')<>'array' then
    raise exception using errcode='22023',message='CATALOG_INVALID';
  end if;
  if jsonb_array_length(p_document->'specifications')>100 or jsonb_array_length(p_document->'images')>30 or jsonb_array_length(p_document->'variants')>100 then raise exception using errcode='22023',message='CATALOG_INVALID'; end if;
  if (select count(*)<>count(distinct v->>'id') from jsonb_array_elements(p_document->'variants') v)
    or (select count(*)<>count(distinct i->>'id') or count(*)<>count(distinct i->>'url') from jsonb_array_elements(p_document->'images') i) then raise exception using errcode='22023',message='CATALOG_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_document->'specifications') s where length(trim(s->>'name')) not between 1 and 200 or length(trim(s->>'value')) not between 1 and 2000 or not(s ?& array['name','value'])) then raise exception using errcode='22023',message='CATALOG_INVALID'; end if;

  insert into public.products(id,organization_id,source_name,source_url,canonical_url,name,product_type,price_vnd,stock_quantity,in_stock,quality,version)
  values(p_product_id,p_organization_id,'OneVoice manual','urn:onevoice:product:'||p_product_id,'urn:onevoice:product:'||p_product_id,p_document->>'name',p_document->>'productType',(p_document->>'priceVnd')::bigint,(p_document->>'stockQuantity')::integer,(p_document->>'inStock')::boolean,'partial',1)
  on conflict(id) do nothing;
  update public.products set name=trim(p_document->>'name'),sku=nullif(p_document->>'sku',''),brand=nullif(p_document->>'brand',''),product_type=trim(p_document->>'productType'),
    description_text=p_document->>'descriptionText',price_vnd=(p_document->>'priceVnd')::bigint,stock_quantity=(p_document->>'stockQuantity')::integer,in_stock=case when (p_document->>'stockQuantity')::integer=0 then false else (p_document->>'inStock')::boolean end,
    specifications=p_document->'specifications',specification_count=jsonb_array_length(p_document->'specifications'),
    -- Derived display hints must not retain superseded imported specifications.
    normalized_attributes=coalesce((select jsonb_object_agg(lower(s->>'name'),s->'value') from jsonb_array_elements(p_document->'specifications') s),'{}'::jsonb),
    disabled_at=case when (p_document->>'active')::boolean then null else coalesce(disabled_at,edit_time) end,
    version=new_version,manually_edited_at=edit_time,updated_at=edit_time where id=p_product_id;

  -- Missing variants are disabled, never deleted; source_variant_id/options remain intact.
  update public.product_variants set disabled_at=coalesce(disabled_at,edit_time),updated_at=edit_time where product_id=p_product_id and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_document->'variants') v);
  for item in select value from jsonb_array_elements(p_document->'variants') loop
    if item->>'id' is null or jsonb_typeof(item->'active') is distinct from 'boolean' or not(item ?& array['priceVnd','stockQuantity','inStock']) then raise exception using errcode='22023',message='CATALOG_INVALID'; end if;
    if exists(select 1 from public.product_variants where id=(item->>'id')::uuid and product_id<>p_product_id) then raise exception using errcode='42501',message='CATALOG_FORBIDDEN'; end if;
    if item->>'imageUrl' is not null and (item->>'imageUrl' !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' or length(item->>'imageUrl')>2048) then raise exception using errcode='22023',message='CATALOG_INVALID'; end if;
    insert into public.product_variants as existing(id,product_id,name,sku,price_vnd,stock_quantity,in_stock,image_url,disabled_at)
    values((item->>'id')::uuid,p_product_id,item->>'name',item->>'sku',(item->>'priceVnd')::bigint,(item->>'stockQuantity')::integer,case when (item->>'stockQuantity')::integer=0 then false else (item->>'inStock')::boolean end,item->>'imageUrl',case when (item->>'active')::boolean then null else edit_time end)
    on conflict(id) do update set name=excluded.name,sku=excluded.sku,price_vnd=excluded.price_vnd,stock_quantity=excluded.stock_quantity,in_stock=excluded.in_stock,image_url=excluded.image_url,disabled_at=excluded.disabled_at,updated_at=edit_time where existing.product_id=excluded.product_id;
    if not found then raise exception using errcode='42501',message='CATALOG_FORBIDDEN'; end if;
  end loop;
  if exists(select 1 from public.product_variants where product_id=p_product_id) then
    if (select coalesce(sum(stock_quantity),0)>2147483647 from public.product_variants where product_id=p_product_id and disabled_at is null) then raise exception using errcode='22023',message='CATALOG_INVALID'; end if;
    update public.products set stock_quantity=(select case when count(*) filter(where stock_quantity is null)>0 then null else coalesce(sum(stock_quantity),0)::integer end from public.product_variants where product_id=p_product_id and disabled_at is null),
      in_stock=coalesce((select bool_or(in_stock) from public.product_variants where product_id=p_product_id and disabled_at is null),false) where id=p_product_id;
  end if;
  -- Retain an original image reference on edited rows; removing an image affects current selection only.
  delete from public.product_images where product_id=p_product_id and id not in(select (i->>'id')::uuid from jsonb_array_elements(p_document->'images') i);
  for item in select value from jsonb_array_elements(p_document->'images') loop
    if item->>'id' is null or item->>'url' is null or item->>'url' !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' or length(item->>'url')>2048 then raise exception using errcode='22023',message='CATALOG_INVALID'; end if;
    if exists(select 1 from public.product_images where id=(item->>'id')::uuid and product_id<>p_product_id) then raise exception using errcode='42501',message='CATALOG_FORBIDDEN'; end if;
    insert into public.product_images as existing(id,product_id,source_url,alt_text,position,is_primary)
    values((item->>'id')::uuid,p_product_id,item->>'url',item->>'altText',image_position,image_position=0)
    on conflict(id) do update set source_url=excluded.source_url,alt_text=excluded.alt_text,position=excluded.position,is_primary=excluded.is_primary where existing.product_id=excluded.product_id;
    if not found then raise exception using errcode='42501',message='CATALOG_FORBIDDEN'; end if;
    image_position := image_position+1;
  end loop;
  -- Manual facts become current immediately; original collection/source timestamps are not rewritten.
  update public.products set quality=case when price_vnd>0 and jsonb_array_length(p_document->'images')>0 and jsonb_array_length(p_document->'specifications')>0 then 'usable' else 'partial' end where id=p_product_id;
  insert into public.catalog_product_edits(request_id,product_id,organization_id,actor_id,version,expected_version,document,source_references)
  values(p_request_id,p_product_id,p_organization_id,p_actor_id,new_version,p_expected_version,p_document,prior_sources);
  insert into public.audit_events(organization_id,actor_kind,actor_id,action,entity_type,entity_id,reason,correlation_id,idempotency_key)
  values(p_organization_id,'staff',p_actor_id,'catalog.product_saved','product',p_product_id,'manager.edit',p_request_id,p_request_id);
  return jsonb_build_object('productId',p_product_id,'version',new_version);
end;
$$;
revoke all on function public.save_catalog_product(uuid,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_catalog_product(uuid,uuid,uuid,uuid,integer,jsonb) to service_role;

-- Retain exact legacy view column shapes/relationships while excluding disabled products.
create or replace view public.content_ready_products with (security_invoker=true) as
select p.id,p.organization_id,p.source_name,p.source_url,p.canonical_url,p.source_product_id,p.slug,p.sku,p.name,p.brand,p.product_type,p.category_name,p.description,p.description_text,p.price_vnd,p.compare_at_price_vnd,p.currency,p.availability,p.in_stock,p.stock_quantity,p.quality,p.completeness_score,p.specification_count,p.collected_at,p.extractor_version,p.source_http_status,p.normalized_attributes,p.specifications,p.breadcrumbs,p.created_at,p.updated_at
from public.products p where p.disabled_at is null and p.quality='usable' and p.in_stock=true and p.price_vnd>0 and p.name is not null and trim(p.name)<>'' and exists(select 1 from public.product_images pi where pi.product_id=p.id);
create or replace view public.product_content_context with (security_invoker=true) as
select p.id as product_id,p.organization_id,p.name,p.sku,p.brand,p.product_type,p.price_vnd as current_price,p.compare_at_price_vnd as compare_at_price,p.in_stock,p.stock_quantity,
  (select pi.source_url from public.product_images pi where pi.product_id=p.id order by pi.is_primary desc,pi.position asc,pi.created_at asc limit 1) as primary_image_url,
  p.normalized_attributes,p.specifications,
  coalesce((select jsonb_agg(jsonb_build_object('code',ap.source_code,'label',ap.label,'discount_type',ap.discount_type,'discount_value',ap.discount_value,'expires_at',ap.expires_at,'is_flash_sale',ap.is_flash_sale)) from public.active_product_promotions ap where ap.product_id=p.id),'[]'::jsonb) as active_promotions,
  p.quality,p.completeness_score,p.collected_at,(p.collected_at<(now()-interval '7 days')) as is_data_stale
from public.products p where p.disabled_at is null;
