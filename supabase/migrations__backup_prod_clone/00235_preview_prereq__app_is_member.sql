-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.app_is_member(
  p_org uuid,
  p_roles text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- retorno neutro en bootstrap
  return false;
end;
$$;

comment on function public.app_is_member(uuid, text[]) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
