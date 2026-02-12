-- 00255_preview_prereq__admin_create_profile.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda REVOKE/GRANT
-- IMPORTANTE: completar RETURNS exacto según 00400_preview_vft.sql
-- Será redefinida por 00400_preview_vft.sql

create or replace function public.admin_create_profile(
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op bootstrap-safe (asumiendo uuid; ajustar si 00400 difiere)
  return null;
end;
$$;

comment on function public.admin_create_profile(text)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
