-- OV033 free-media registry. License proof is stored metadata, never a successful download.
create table public.free_media_assets (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  source_url text not null check(length(source_url) between 1 and 2048 and source_url like 'https://%'),
  provider text not null check(provider ~ '^[a-z][a-z0-9_-]{0,31}$' and provider not in ('facebook','instagram')),
  author text check(author is null or char_length(author) between 1 and 200),
  license_id text not null check(license_id in ('cc0-1.0','cc-by-4.0','cc-by-3.0','public-domain','pexels','unsplash','catalog')),
  license_url text not null check(length(license_url) between 1 and 2048 and license_url like 'https://%'),
  retrieved_at timestamptz not null,
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
  width integer check(width is null or width between 1 and 8192),
  height integer check(height is null or height between 1 and 8192),
  status text not null check(status in ('usable','failed','expired','revoked')),
  provenance text not null check(provenance in ('catalog','stock')),
  sku_id uuid,
  attribution text check(attribution is null or char_length(attribution) between 1 and 500),
  expires_at timestamptz,
  unique(organization_id, content_hash),
  check ((provenance='catalog') = (license_id='catalog')),
  check ((provenance='catalog') = (sku_id is not null)),
  check (license_id not in ('cc-by-4.0','cc-by-3.0') or attribution is not null),
  check (status<>'usable' or expires_at is null or expires_at>retrieved_at)
);
create index free_media_assets_usable_idx on public.free_media_assets(organization_id, provenance, sku_id, retrieved_at desc) where status='usable';
alter table public.free_media_assets enable row level security;
revoke all on public.free_media_assets from public,anon,authenticated,service_role;
grant select on public.free_media_assets to service_role;
create policy free_media_assets_service_read on public.free_media_assets for select to service_role using(true);

create function public.register_free_media_asset(p_organization_id uuid, p_asset jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare existing public.free_media_assets; asset public.free_media_assets;
begin
  if p_organization_id is null or p_asset is null or jsonb_typeof(p_asset)<>'object' then raise exception 'MEDIA_INVALID' using errcode='22023'; end if;
  if (p_asset->>'id') is null or (p_asset->>'contentHash') is null or (p_asset->>'sourceUrl') is null then raise exception 'MEDIA_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||(p_asset->>'contentHash'), 330));
  select * into existing from public.free_media_assets where organization_id=p_organization_id and content_hash=p_asset->>'contentHash';
  if found then
    if existing.id is distinct from (p_asset->>'id')::uuid and existing.content_hash is not distinct from p_asset->>'contentHash' then
      return jsonb_build_object('id',existing.id,'sourceUrl',existing.source_url,'provider',existing.provider,'author',existing.author,'licenseId',existing.license_id,'licenseUrl',existing.license_url,'retrievedAt',existing.retrieved_at,'contentHash',existing.content_hash,'mime',existing.mime,'dimensions',jsonb_build_object('width',existing.width,'height',existing.height),'status',existing.status,'provenance',existing.provenance,'skuId',existing.sku_id,'attribution',existing.attribution);
    end if;
    if row(existing.id,existing.source_url,existing.provider,existing.license_id,existing.content_hash,existing.provenance)
      is distinct from row((p_asset->>'id')::uuid,p_asset->>'sourceUrl',p_asset->>'provider',p_asset->>'licenseId',p_asset->>'contentHash',p_asset->>'provenance') then
      raise exception 'MEDIA_CONFLICT' using errcode='40001';
    end if;
    return jsonb_build_object('id',existing.id,'sourceUrl',existing.source_url,'provider',existing.provider,'author',existing.author,'licenseId',existing.license_id,'licenseUrl',existing.license_url,'retrievedAt',existing.retrieved_at,'contentHash',existing.content_hash,'mime',existing.mime,'dimensions',jsonb_build_object('width',existing.width,'height',existing.height),'status',existing.status,'provenance',existing.provenance,'skuId',existing.sku_id,'attribution',existing.attribution);
  end if;
  if (p_asset->>'status') is distinct from 'usable' then raise exception 'MEDIA_INVALID' using errcode='22023'; end if;
  if (p_asset->>'provenance')='stock' and (p_asset->>'skuId') is not null then raise exception 'MEDIA_INVALID' using errcode='22023'; end if;
  if (p_asset->>'sourceUrl') ~* 'https://([^/]*\.)?(facebook\.com|fbcdn\.net|messenger\.com|instagram\.com|cdninstagram\.com)([/?#]|$)' then raise exception 'MEDIA_FORBIDDEN' using errcode='42501'; end if;
  insert into public.free_media_assets(id,organization_id,source_url,provider,author,license_id,license_url,retrieved_at,content_hash,mime,width,height,status,provenance,sku_id,attribution,expires_at)
  values(
    (p_asset->>'id')::uuid,p_organization_id,p_asset->>'sourceUrl',p_asset->>'provider',nullif(p_asset->>'author',''),p_asset->>'licenseId',p_asset->>'licenseUrl',
    (p_asset->>'retrievedAt')::timestamptz,p_asset->>'contentHash',p_asset->>'mime',nullif(p_asset->>'width','')::int,nullif(p_asset->>'height','')::int,
    'usable',p_asset->>'provenance',nullif(p_asset->>'skuId','')::uuid,nullif(p_asset->>'attribution',''),nullif(p_asset->>'expiresAt','')::timestamptz
  ) returning * into asset;
  return jsonb_build_object('id',asset.id,'sourceUrl',asset.source_url,'provider',asset.provider,'author',asset.author,'licenseId',asset.license_id,'licenseUrl',asset.license_url,'retrievedAt',asset.retrieved_at,'contentHash',asset.content_hash,'mime',asset.mime,'dimensions',jsonb_build_object('width',asset.width,'height',asset.height),'status',asset.status,'provenance',asset.provenance,'skuId',asset.sku_id,'attribution',asset.attribution);
end $$;

create function public.list_usable_free_media_assets(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
begin
  if p_organization_id is null then raise exception 'MEDIA_INVALID' using errcode='22023'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'sourceUrl',source_url,'provider',provider,'author',author,'licenseId',license_id,'licenseUrl',license_url,'retrievedAt',retrieved_at,'contentHash',content_hash,'mime',mime,'dimensions',jsonb_build_object('width',width,'height',height),'status',status,'provenance',provenance,'skuId',sku_id,'attribution',attribution) order by retrieved_at desc, id)
    from public.free_media_assets
    where organization_id=p_organization_id and status='usable' and (expires_at is null or expires_at>clock_timestamp())
  ), '[]'::jsonb);
end $$;

create function public.revoke_free_media_asset(p_organization_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare asset public.free_media_assets;
begin
  if p_organization_id is null or p_id is null then raise exception 'MEDIA_INVALID' using errcode='22023'; end if;
  update public.free_media_assets set status='revoked' where organization_id=p_organization_id and id=p_id and status in ('usable','expired','failed') returning * into asset;
  if not found then raise exception 'MEDIA_CONFLICT' using errcode='40001'; end if;
  return jsonb_build_object('id',asset.id,'status',asset.status);
end $$;

revoke all on function public.register_free_media_asset(uuid,jsonb), public.list_usable_free_media_assets(uuid), public.revoke_free_media_asset(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.register_free_media_asset(uuid,jsonb), public.list_usable_free_media_assets(uuid), public.revoke_free_media_asset(uuid,uuid) to service_role;
