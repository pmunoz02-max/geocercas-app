-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.count_active_trackers(
  p_org_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- retorno neutro en bootstrap
  return 0;
end;
$$;

comment on function public.count_active_trackers(uuid) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
