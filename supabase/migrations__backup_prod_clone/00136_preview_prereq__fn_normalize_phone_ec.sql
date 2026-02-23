-- 00136_preview_prereq__fn_normalize_phone_ec.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.fn_normalize_phone_ec(
  t text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro
  return nullif(btrim(t), '');
end;
$$;

-- Opcional: 00300 hará los GRANT/REVOKE canónicos igual
revoke all on function public.fn_normalize_phone_ec(text) from public;
grant execute on function public.fn_normalize_phone_ec(text) to anon, authenticated;
