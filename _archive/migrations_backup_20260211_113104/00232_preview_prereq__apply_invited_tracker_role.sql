-- PREREQ bootstrap-safe para permitir GRANT/REVOKE en 00300_preview_rls.sql
-- Redefinida por 00400_preview_vft.sql

create or replace function public.apply_invited_tracker_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op en bootstrap
  return;
end;
$$;

comment on function public.apply_invited_tracker_role() is
'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';
