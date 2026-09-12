-- One read-only statement snapshot. Caller must verify conversation/organization scope.
create or replace function public.lookup_consultation_evidence(p_organization_id uuid,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare op text; instant timestamptz:=statement_timestamp(); result jsonb; products jsonb:='[]'; policies jsonb:='[]'; promotions jsonb:='[]'; knowledge jsonb:='[]'; missing jsonb:='[]'; row_data jsonb; item jsonb; source record; count_items integer; result_limit integer; target uuid; truncated boolean:=false;
begin
 if p_organization_id is null or p_query is null or jsonb_typeof(p_query)<>'object' or octet_length(p_query::text)>4096 then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if;
 op:=p_query->>'operation';
 if op not in ('search_products','compare_products','read_guidance') or op is null then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if;
 if op='search_products' then
  if p_query-array['operation','need','brand','productType','minPriceVnd','maxPriceVnd','specs','availability','limit']<>'{}' or (jsonb_typeof(p_query->'need')='string' and length(p_query->>'need')<=120) is not true or (jsonb_typeof(p_query->'brand')='string' and length(p_query->>'brand')<=100) is not true or (jsonb_typeof(p_query->'productType')='string' and length(p_query->>'productType')<=100) is not true or jsonb_typeof(p_query->'specs') is distinct from 'array' or jsonb_array_length(p_query->'specs')>5 or (p_query->>'availability' in ('available','any')) is not true or (p_query->>'limit' ~ '^[1-5]$') is not true then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if;
  foreach item in array array[p_query->'minPriceVnd',p_query->'maxPriceVnd'] loop if item is not null and (jsonb_typeof(item)<>'number' or (item#>>'{}') !~ '^\d+$' or (item#>>'{}')::numeric>9007199254740991) then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if; end loop;
  if (p_query->>'minPriceVnd')::numeric>(p_query->>'maxPriceVnd')::numeric then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_query->'specs') loop if jsonb_typeof(item)<>'object' or item-array['name','value']<>'{}' or (length(item->>'name') between 1 and 80) is not true or (length(item->>'value') between 1 and 120) is not true then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if; end loop;
  result_limit:=(p_query->>'limit')::int;
  if btrim(p_query->>'need')='' and btrim(p_query->>'brand')='' and btrim(p_query->>'productType')='' and jsonb_array_length(p_query->'specs')=0 and not p_query ?| array['minPriceVnd','maxPriceVnd'] then return jsonb_build_object('asOf',instant,'missing',jsonb_build_array('need_required')); end if;
 elsif op='compare_products' then
  if p_query-array['operation','items']<>'{}' or jsonb_typeof(p_query->'items') is distinct from 'array' or jsonb_array_length(p_query->'items') not between 1 and 4 then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_query->'items') loop
   if jsonb_typeof(item)<>'object' or item-array['productId','variantId','expectedSku']<>'{}' or item->>'productId' is null or (item ? 'expectedSku' and (jsonb_typeof(item->'expectedSku')<>'string' or length(item->>'expectedSku')>100)) then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if;
   perform (item->>'productId')::uuid,(item->>'variantId')::uuid;
  end loop;
  result_limit:=4;
 else
  if p_query-array['operation','productId','query']<>'{}' or (jsonb_typeof(p_query->'query')='string' and length(p_query->>'query')<=120) is not true then raise exception 'EVIDENCE_INVALID' using errcode='22023'; end if;
  target:=(p_query->>'productId')::uuid;
  if target is not null and not exists(select 1 from public.products where id=target and organization_id=p_organization_id and disabled_at is null) then return jsonb_build_object('asOf',instant,'missing',jsonb_build_array('identity_or_scope_mismatch')); end if;
 end if;
 if op in ('search_products','compare_products') then
  for row_data in
   with buckets as (
    select p.id product_id,v.id variant_id,p.version,p.updated_at,v.updated_at variant_updated_at,
     left(p.name||case when v.name is not null then ' / '||v.name else '' end,600) name,
     case when v.id is null then p.sku else v.sku end sku,p.brand,p.product_type,
     case when v.id is null then p.price_vnd else v.price_vnd end price,
     case when v.id is null then p.stock_quantity else v.stock_quantity end quantity,
     case when v.id is null then p.in_stock else v.in_stock end in_stock,p.specifications,v.options
    from public.products p left join public.product_variants v on v.product_id=p.id and v.disabled_at is null
    where p.organization_id=p_organization_id and p.disabled_at is null
     and (v.id is not null or not exists(select 1 from public.product_variants any_v where any_v.product_id=p.id))
   ), checked as (
    select b.*,
     (case when b.specifications is null then true when jsonb_typeof(b.specifications)<>'array' then false when jsonb_array_length(b.specifications)>100 then false else not exists(select 1 from jsonb_array_elements(b.specifications) s where (jsonb_typeof(s->'name')='string' and jsonb_typeof(s->'value')='string' and length(s->>'name') between 1 and 200 and length(s->>'value') between 1 and 2000) is not true) end
      and case when b.options is null then true when jsonb_typeof(b.options)<>'object' then false else (select count(*)<=20 from (select 1 from jsonb_each(b.options) limit 21) bounded_options) and not exists(select 1 from jsonb_each(b.options) where (jsonb_typeof(value)='string' and length(key) between 1 and 200 and length(value#>>'{}') between 1 and 2000) is not true) end) specs_complete
     from buckets b
   ), normalized as (
    select b.*,coalesce((select jsonb_agg(spec) from (
     (select jsonb_build_object('name',s->>'name','value',s->>'value','scope','product') spec from jsonb_array_elements(case when jsonb_typeof(b.specifications)='array' then b.specifications else '[]' end) s where jsonb_typeof(s->'name')='string' and jsonb_typeof(s->'value')='string' and length(s->>'name') between 1 and 200 and length(s->>'value') between 1 and 2000 limit 100)
     union all
     (select jsonb_build_object('name',key,'value',value#>>'{}','scope','variant') spec from jsonb_each(case when jsonb_typeof(b.options)='object' then b.options else '{}' end) where jsonb_typeof(value)='string' and length(key) between 1 and 200 and length(value#>>'{}') between 1 and 2000 limit 20)
    ) valid_specs),'[]') specs from checked b
   )
   select jsonb_build_object('productId',product_id,'variantId',variant_id,'version',version,'variantUpdatedAt',variant_updated_at,'name',name,'sku',left(sku,100),'brand',left(brand,100),'productType',left(product_type,100),'priceVnd',price,'stockQuantity',quantity,'inStock',in_stock,'updatedAt',updated_at,'specificationsComplete',specs_complete,'specifications',case when specs_complete then specs else '[]' end)
   from normalized n
   where (op='compare_products' and exists(select 1 from jsonb_array_elements(p_query->'items') i where (i->>'productId')::uuid=n.product_id and (i->>'variantId')::uuid is not distinct from n.variant_id and (not i ? 'expectedSku' or i->>'expectedSku'=n.sku)))
    or (op='search_products'
     and (p_query->>'availability'='any' or (quantity>0 and in_stock is true))
     and (p_query->>'brand'='' or lower(brand)=lower(p_query->>'brand')) and (p_query->>'productType'='' or lower(product_type)=lower(p_query->>'productType'))
     and (not p_query ? 'minPriceVnd' or price>=(p_query->>'minPriceVnd')::bigint) and (not p_query ? 'maxPriceVnd' or price<=(p_query->>'maxPriceVnd')::bigint)
     and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query->>'need')),'\s+') term where term<>'' and strpos(lower(concat_ws(' ',name,sku,brand,product_type,case when specs_complete then specs::text else '' end)),term)=0)
     and (jsonb_array_length(p_query->'specs')=0 or specs_complete)
     and not exists(select 1 from jsonb_array_elements(p_query->'specs') wanted where (select count(distinct s->>'value') from jsonb_array_elements(n.specs) s where lower(s->>'name')=lower(wanted->>'name'))<>1 or not exists(select 1 from jsonb_array_elements(n.specs) s where lower(s->>'name')=lower(wanted->>'name') and strpos(lower(s->>'value'),lower(wanted->>'value'))>0)))
   order by price nulls last,product_id,variant_id limit result_limit+1
  loop products:=products||jsonb_build_array(row_data); end loop;
  if jsonb_array_length(products)>result_limit then products:=products-result_limit;truncated:=true;end if;
  if op='compare_products' and jsonb_array_length(products)<>jsonb_array_length(p_query->'items') then products:='[]';missing:=jsonb_build_array('identity_or_scope_mismatch');
  elsif products='[]' then missing:=jsonb_build_array('no_matching_products');end if;
 else
  for source in select * from public.business_policies p where p.organization_id=p_organization_id and p.disabled_at is null and (p.starts_at is null or p.starts_at<=instant) and (p.expires_at is null or p.expires_at>instant) and (cardinality(p.product_ids)=0 or target=any(p.product_ids)) order by p.kind,p.id limit 21 loop
   policies:=policies||jsonb_build_array(jsonb_build_object('id',source.id,'kind',source.kind,'title',source.title,'body',source.body,'source','business_policy','version',source.version,'asOf',instant,'startsAt',source.starts_at,'expiresAt',source.expires_at,'productId',target,'trust','canonical_business_data'));
  end loop;
  for source in select * from public.promotions p where p.organization_id=p_organization_id and p.disabled_at is null and (p.starts_at is null or p.starts_at<=instant) and (p.expires_at is null or p.expires_at>instant) and (p.scope='all' or (target is not null and exists(select 1 from public.product_promotions pp where pp.product_id=target and pp.promotion_id=p.id))) order by p.id limit 21 loop
   promotions:=promotions||jsonb_build_array(jsonb_build_object('id',source.id,'title',source.label,'body',coalesce(source.details_text,source.label),'discountType',source.discount_type,'discountValue',source.discount_value,'source','business_promotion','version',source.version,'asOf',instant,'startsAt',source.starts_at,'expiresAt',source.expires_at,'productId',target,'trust','canonical_business_data'));
  end loop;
  if jsonb_array_length(policies)>20 or jsonb_array_length(promotions)>20 then policies:='[]';promotions:='[]';missing:=missing||jsonb_build_array('guidance_too_broad');end if;
  count_items:=0;
  for source in select k.id from public.knowledge_sources k where k.organization_id=p_organization_id and (k.document->>'active')::boolean and ((target is null and k.document->'productIds'='[]') or (target is not null and k.document->'productIds' ? target::text)) order by k.id limit 21 loop
   count_items:=count_items+1;if count_items=21 then truncated:=true;end if;
   row_data:=public.read_current_knowledge(p_organization_id,source.id);
   if row_data is null then missing:=missing||jsonb_build_array('knowledge_unavailable:'||source.id::text);continue;end if;
   select coalesce(jsonb_agg(chunk),'[]') into item from (select value chunk from jsonb_array_elements(row_data->'chunks') where p_query->>'query'='' or strpos(lower(value#>>'{}'),lower(p_query->>'query'))>0 limit 3) matches;
   if item='[]' then continue;end if;
   if jsonb_array_length(row_data->'chunks')>jsonb_array_length(item) then truncated:=true;end if;
   knowledge:=knowledge||jsonb_build_array((row_data-'chunks')||jsonb_build_object('chunks',item,'asOf',instant,'trust','untrusted_external','use','descriptive_only','productId',target));
   if jsonb_array_length(knowledge)=5 then truncated:=true;exit;end if;
  end loop;
  if policies='[]' then missing:=missing||jsonb_build_array('policy');end if;
  if promotions='[]' then missing:=missing||jsonb_build_array('active_promotion');end if;
  if knowledge='[]' then missing:=missing||jsonb_build_array('verified_descriptive_evidence');end if;
 end if;
 result:=jsonb_build_object('asOf',instant,'products',products,'policies',policies,'promotions',promotions,'knowledge',knowledge,'missing',missing,'truncated',truncated);
 if octet_length(result::text)>524288 then return jsonb_build_object('asOf',instant,'missing',jsonb_build_array('evidence_too_broad'),'truncated',true);end if;
 return result;
end $$;
revoke all on function public.lookup_consultation_evidence(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lookup_consultation_evidence(uuid,jsonb) to service_role;
