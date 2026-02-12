-- 00258_preview_prereq__admin_assign_or_create_org.sql
-- PREREQ bootstrap-safe: existe solo para que 00300_preview_rls.sql pueda GRANT/REVOKE
-- Nota: asumimos RETURNS uuid (org_id). Será redefinida por 00400_preview_vft.sql.

create or replace function public.admin_assign_or_create_org(
  p_email text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- no-op bootstrap-safe
  return null;
end;
$$;

comment on function public.admin_assign_or_create_org(text,text)
is 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';
