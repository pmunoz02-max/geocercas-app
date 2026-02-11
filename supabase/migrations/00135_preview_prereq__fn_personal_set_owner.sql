-- 00135_preview_prereq__fn_personal_set_owner.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.fn_personal_set_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro para trigger
  return new;
end;
$$;

-- Opcional: 00300 hará los GRANT/REVOKE canónicos igual
revoke all on function public.fn_personal_set_owner() from public;
grant execute on function public.fn_personal_set_owner() to anon, authenticated;
