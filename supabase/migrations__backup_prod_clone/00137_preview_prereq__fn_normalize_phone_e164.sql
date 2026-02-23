-- 00137_preview_prereq__fn_normalize_phone_e164.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.fn_normalize_phone_e164(
  p_raw text,
  p_default_cc text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro: devuelve el raw si viene, o null
  return nullif(btrim(p_raw), '');
end;
$$;

-- Opcional: 00300 hará los GRANT/REVOKE canónicos igual
revoke all on function public.fn_normalize_phone_e164(text, text) from public;
grant execute on function public.fn_normalize_phone_e164(text, text) to anon, authenticated;
