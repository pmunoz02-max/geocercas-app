-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.app_current_tenant_id(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- retorno neutro: sin tenant definido aún
  return null;
end;
$$;

comment on function public.app_current_tenant_id(uuid) is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
