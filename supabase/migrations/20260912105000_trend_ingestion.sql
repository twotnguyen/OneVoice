-- Immutable run snapshots are evidence receipts for OV029. No catalog/AI mutation.
create table public.trend_ingestion_runs (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 observed_at timestamptz not null,
 committed_at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=524288)
);
create index trend_runs_latest_idx on public.trend_ingestion_runs(organization_id,observed_at desc,id desc);
create table public.trend_observations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 source_key text not null check(source_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
 source_kind text not null check(source_kind in ('mastodon_tags','rss_news')),
 source_url text not null check(length(source_url) between 1 and 2048),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16384 and evidence->>'trust'='untrusted_external'),
 first_observed_at timestamptz not null,
 last_observed_at timestamptz not null,
 expires_at timestamptz not null,
 unique(organization_id,source_key,source_url,fingerprint)
);
create index trend_observations_fresh_idx on public.trend_observations(organization_id,expires_at);
alter table public.trend_ingestion_runs enable row level security;
alter table public.trend_observations enable row level security;
revoke all on public.trend_ingestion_runs,public.trend_observations from public,anon,authenticated,service_role;
grant select on public.trend_ingestion_runs,public.trend_observations to service_role;
create policy trend_runs_service_read on public.trend_ingestion_runs for select to service_role using(true);
create policy trend_observations_service_read on public.trend_observations for select to service_role using(true);

create or replace function public.record_trend_ingestion(p_organization_id uuid,p_run_id uuid,p_batch jsonb)
returns uuid language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare old_run public.trend_ingestion_runs; source jsonb; item jsonb; observed timestamptz; expires timestamptz; evidence jsonb; existing public.trend_observations;
begin
 if p_organization_id is null or p_run_id is null or p_batch is null or jsonb_typeof(p_batch)!='object' or octet_length(p_batch::text)>524288 then raise exception 'invalid_trend_batch' using errcode='22023'; end if;
 -- Serialize same receipt before any mutation, including cross-org accidental reuse.
 perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,280));
 select * into old_run from public.trend_ingestion_runs where id=p_run_id;
 if found then
  if old_run.organization_id is distinct from p_organization_id or old_run.snapshot is distinct from p_batch then raise exception 'trend_receipt_conflict' using errcode='22023'; end if;
  return old_run.id;
 end if;
 if jsonb_typeof(p_batch->'sources') is distinct from 'array' or jsonb_array_length(p_batch->'sources')>10 or p_batch#>>'{capabilities,facebook}' is distinct from 'unavailable' then raise exception 'invalid_trend_batch' using errcode='22023'; end if;
 observed=(p_batch->>'observedAt')::timestamptz;
 if observed is null or not isfinite(observed) or observed>clock_timestamp()+interval '5 minutes' or observed<clock_timestamp()-interval '1 day' then raise exception 'invalid_trend_batch' using errcode='22023'; end if;
 if (select count(*)<>count(distinct value->>'key') from jsonb_array_elements(p_batch->'sources')) then raise exception 'invalid_trend_batch' using errcode='22023'; end if;
 if p_batch#>>'{capabilities,social}' is distinct from (case when not exists(select 1 from jsonb_array_elements(p_batch->'sources') s where s->>'kind'='mastodon_tags') then 'unconfigured' when exists(select 1 from jsonb_array_elements(p_batch->'sources') s where s->>'kind'='mastodon_tags' and s->>'status' in ('success','empty')) then 'available' else 'unavailable' end) or p_batch#>>'{capabilities,news}' is distinct from (case when not exists(select 1 from jsonb_array_elements(p_batch->'sources') s where s->>'kind'='rss_news') then 'unconfigured' when exists(select 1 from jsonb_array_elements(p_batch->'sources') s where s->>'kind'='rss_news' and s->>'status' in ('success','empty')) then 'available' else 'unavailable' end) then raise exception 'invalid_trend_batch' using errcode='22023'; end if;
 insert into public.trend_ingestion_runs(id,organization_id,observed_at,snapshot) values(p_run_id,p_organization_id,observed,p_batch);
 for source in select value from jsonb_array_elements(p_batch->'sources') loop
  if (source->>'key' ~ '^[a-z][a-z0-9_-]{0,63}$') is not true or (source->>'kind' in ('mastodon_tags','rss_news')) is not true or (source->>'url' ~ '^https://[^/@:]+[./]') is not true or length(source->>'url')>2048 or ((source->>'ttlSeconds')::int between 900 and 604800) is not true or (source->>'status' in ('success','empty','error')) is not true or jsonb_typeof(source->'observations') is distinct from 'array' or jsonb_array_length(source->'observations')>50 then raise exception 'invalid_trend_source' using errcode='22023'; end if;
  if (source->>'status'='success') is distinct from (jsonb_array_length(source->'observations')>0) or (source->>'status'='error' and (source->>'errorCode' in ('unsafe_url','unsafe_address','dns_unavailable','timeout','aborted','too_large','redirect_rejected','http_error','unsupported_encoding','network_error','invalid_response')) is not true) or (source->>'status'<>'error' and source->>'errorCode' is not null) then raise exception 'invalid_trend_source' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(source->'observations') loop
   if item->>'trust' is distinct from 'untrusted_external' or (item->>'fingerprint' ~ '^[0-9a-f]{64}$') is not true or (length(item->>'topic') between 1 and 240) is not true or (length(item->>'url') between 1 and 2048) is not true or (item->>'url' like 'https://%') is not true or (item->>'timestampKind' in ('published','metric_day','unknown')) is not true or octet_length(item::text)>16384 then raise exception 'invalid_trend_observation' using errcode='22023'; end if;
   if (source->>'kind'='rss_news' and (item->'metrics' is distinct from 'null'::jsonb or item->>'timestampKind'='metric_day')) or (source->>'kind'='mastodon_tags' and (item#>>'{metrics,scope}' is distinct from 'mastodon_instance' or item->>'timestampKind'='published')) then raise exception 'invalid_trend_observation' using errcode='22023'; end if;
   if (item->>'sourceTimestamp' is null) is distinct from (item->>'timestampKind'='unknown') then raise exception 'invalid_trend_observation' using errcode='22023'; end if;
   expires=(item->>'expiresAt')::timestamptz;
   if expires is null or not isfinite(expires) or expires>observed+make_interval(secs=>(source->>'ttlSeconds')::int) or (item->>'sourceTimestamp' is not null and ((item->>'sourceTimestamp')::timestamptz>observed+interval '5 minutes' or not isfinite((item->>'sourceTimestamp')::timestamptz))) then raise exception 'invalid_trend_observation' using errcode='22023'; end if;
   if item->>'sourceTimestamp' is not null and expires>(item->>'sourceTimestamp')::timestamptz+make_interval(secs=>(source->>'ttlSeconds')::int)+(case when item->>'timestampKind'='metric_day' then interval '1 day' else interval '0' end) then raise exception 'invalid_trend_observation' using errcode='22023'; end if;
   evidence=item-'expiresAt'-'fingerprint';
   insert into public.trend_observations(organization_id,source_key,source_kind,source_url,fingerprint,evidence,first_observed_at,last_observed_at,expires_at)
    values(p_organization_id,source->>'key',source->>'kind',source->>'url',item->>'fingerprint',evidence,observed,observed,expires)
    on conflict(organization_id,source_key,source_url,fingerprint) do nothing;
   select * into existing from public.trend_observations where organization_id=p_organization_id and source_key=source->>'key' and source_url=source->>'url' and fingerprint=item->>'fingerprint' for update;
   if existing.evidence is distinct from evidence or existing.source_kind is distinct from source->>'kind' then raise exception 'trend_evidence_conflict' using errcode='22023'; end if;
   if observed>existing.last_observed_at then update public.trend_observations set last_observed_at=observed,expires_at=expires where id=existing.id; end if;
  end loop;
 end loop;
 return p_run_id;
end;
$$;
revoke all on function public.record_trend_ingestion(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_trend_ingestion(uuid,uuid,jsonb) to service_role;
