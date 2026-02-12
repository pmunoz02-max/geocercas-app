-- 00155_preview_prereq__ensure_personal_org_for_user.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.ensure_personal_org_for_user(
  p_user_id uuid,
  p_org_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;

-- Importante: como 00300 hace REVOKE/GRANT, la función debe existir sí o sí
revoke all on function public.ensure_personal_org_for_user(uuid, text) from public;
grant execute on function public.ensure_personal_org_for_user(uuid, text) to anon, authenticated;
