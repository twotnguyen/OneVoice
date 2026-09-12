-- SPDX-License-Identifier: Apache-2.0
-- OV-055 anonymous website sessions.
-- Cookie token is 32-byte CSPRNG base64url (ov_web_session). At rest: SHA-256 hex as token_hash PK.
-- WEB channel_user_key for OV-054 project_web_conversation equals token_hash (never raw cookie, never conversations.id).
-- Rate-limit create is persisted (scope=session_create, client_key=sha256 of IP or similar). Raw IP is not stored.

create table public.website_sessions (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 channel_user_key text not null check(char_length(channel_user_key) between 1 and 256 and channel_user_key=token_hash),
 created_at timestamptz not null default clock_timestamp(),
 last_seen timestamptz not null default clock_timestamp()
);
create unique index website_sessions_org_key_idx on public.website_sessions(organization_id,channel_user_key);

create table public.website_rate_limits (
 scope text not null check(char_length(scope) between 1 and 64),
 client_key text not null check(client_key ~ '^[0-9a-f]{64}$'),
 window_started_at timestamptz not null,
 hit_count integer not null check(hit_count>=0),
 primary key(scope,client_key)
);

create function public.website_sessions_protect() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='55000', message='website session identity is immutable'; end if;
 if new.token_hash is distinct from old.token_hash or new.organization_id is distinct from old.organization_id or new.channel_user_key is distinct from old.channel_user_key or new.created_at is distinct from old.created_at then
  raise exception using errcode='55000', message='website session identity is immutable';
 end if;
 return new;
end $$;
create trigger website_sessions_protect before update or delete on public.website_sessions for each row execute function public.website_sessions_protect();

alter table public.website_sessions enable row level security;
alter table public.website_rate_limits enable row level security;
revoke all on public.website_sessions,public.website_rate_limits from public,anon,authenticated,service_role;
grant select on public.website_sessions,public.website_rate_limits to service_role;
create policy website_sessions_read on public.website_sessions for select to service_role using(true);
create policy website_rate_limits_read on public.website_rate_limits for select to service_role using(true);

create function public.take_website_rate_limit(p_scope text, p_client_key text, p_limit integer, p_window_ms integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare row public.website_rate_limits%rowtype; now timestamptz:=clock_timestamp();
begin
 if p_scope is null or char_length(p_scope) not between 1 and 64 or p_client_key is null or p_client_key !~ '^[0-9a-f]{64}$' or p_limit is null or p_limit<1 or p_window_ms is null or p_window_ms<1 then
  raise exception using errcode='22023', message='SESSION_INVALID';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope||':'||p_client_key,55));
 insert into public.website_rate_limits(scope,client_key,window_started_at,hit_count) values(p_scope,p_client_key,now,0)
 on conflict(scope,client_key) do nothing;
 select * into row from public.website_rate_limits where scope=p_scope and client_key=p_client_key for update;
 if now-row.window_started_at >= (p_window_ms::double precision * interval '1 millisecond') then
  update public.website_rate_limits set window_started_at=now, hit_count=0 where scope=p_scope and client_key=p_client_key;
  row.hit_count:=0;
 end if;
 if row.hit_count>=p_limit then return false; end if;
 update public.website_rate_limits set hit_count=hit_count+1 where scope=p_scope and client_key=p_client_key;
 return true;
end $$;

create function public.create_website_session(p_organization_id uuid, p_token_hash text, p_channel_user_key text, p_client_key text, p_limit integer, p_window_ms integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_organization_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_channel_user_key is distinct from p_token_hash or p_client_key is null or p_client_key !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023', message='SESSION_INVALID';
 end if;
 perform 1 from public.organizations where id=p_organization_id for share;
 if not found then raise exception using errcode='22023', message='SESSION_INVALID'; end if;
 if not public.take_website_rate_limit('session_create',p_client_key,coalesce(p_limit,5),coalesce(p_window_ms,60000)) then
  return jsonb_build_object('ok',false,'code','RATE_LIMITED');
 end if;
 insert into public.website_sessions(token_hash,organization_id,channel_user_key) values(p_token_hash,p_organization_id,p_channel_user_key);
 return jsonb_build_object('ok',true,'organizationId',p_organization_id,'channelUserKey',p_channel_user_key);
end $$;

create function public.read_website_session(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.website_sessions%rowtype;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 update public.website_sessions set last_seen=clock_timestamp() where token_hash=p_token_hash returning * into row;
 if not found then return null; end if;
 return jsonb_build_object('ok',true,'organizationId',row.organization_id,'channelUserKey',row.channel_user_key);
end $$;

revoke all on function public.website_sessions_protect(), public.take_website_rate_limit(text,text,integer,integer), public.create_website_session(uuid,text,text,text,integer,integer), public.read_website_session(text) from public,anon,authenticated,service_role;
grant execute on function public.take_website_rate_limit(text,text,integer,integer), public.create_website_session(uuid,text,text,text,integer,integer), public.read_website_session(text) to service_role;
