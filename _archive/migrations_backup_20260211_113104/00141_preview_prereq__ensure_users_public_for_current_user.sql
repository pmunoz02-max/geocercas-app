-- 00141_preview_prereq__ensure_users_public_for_current_user.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.ensure_users_public_for_current_user(
  p_role text,
  p_full_name text,
  p_phone_e164 text
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

-- Opcional: 00300 hará los GRANT/REVOKE canónicos igual
revoke all on function public.ensure_users_public_for_current_user(text, text, text) from public;
grant execute on function public.ensure_users_public_for_current_user(text, text, text) to anon, authenticated;
