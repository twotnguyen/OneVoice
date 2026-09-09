-- SPDX-License-Identifier: Apache-2.0

create or replace function public.onevoice_healthcheck()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'ok'::text;
$$;

revoke all on function public.onevoice_healthcheck() from public;
grant execute on function public.onevoice_healthcheck() to anon, authenticated;
