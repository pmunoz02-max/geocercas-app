create schema if not exists public;

create or replace function public.get_or_create_default_org_id_for_current_user()
returns uuid
language sql
stable
as $$
  select null::uuid;
$$;