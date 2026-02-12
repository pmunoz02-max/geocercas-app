-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.compute_effective_app_role(
  p_uid uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- retorno neutro en bootstrap
  return 'viewer';
end;
$$;

comment on function public.compute_effective_app_role(uuid) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
