-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.app_ensure_org_and_membership(
  p_org uuid,
  p_name text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op / retorno neutro
  return p_org;
end;
$$;

comment on function public.app_ensure_org_and_membership(uuid, text, text) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
