-- 00138_preview_prereq__fix_missing_membership_from_profile.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.fix_missing_membership_from_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro
  return;
end;
$$;

-- Opcional: 00300 hará los GRANT/REVOKE canónicos igual
revoke all on function public.fix_missing_membership_from_profile() from public;
grant execute on function public.fix_missing_membership_from_profile() to anon, authenticated;
