-- 00146_preview_prereq__ensure_user_org_context.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.ensure_user_org_context(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro
  return '{}'::jsonb;
end;
$$;

-- Importante: 00300 hace REVOKE/GRANT, la función debe existir
revoke all on function public.ensure_user_org_context(uuid) from public;
grant execute on function public.ensure_user_org_context(uuid) to anon, authenticated;
