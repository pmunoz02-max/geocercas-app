-- 00139_preview_prereq__finish_asignacion.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.

create or replace function public.finish_asignacion(
  p_id uuid,
  p_end_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op neutro
  return true;
end;
$$;

-- Opcional: 00300 hará los GRANT/REVOKE canónicos igual
revoke all on function public.finish_asignacion(uuid, date) from public;
grant execute on function public.finish_asignacion(uuid, date) to anon, authenticated;
