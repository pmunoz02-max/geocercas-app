-- 00149_preview_prereq__ensure_tracker_membership__4args.sql
-- PREREQ bootstrap-safe: solo para permitir que 00300_preview_rls.sql avance.
-- Será redefinida por 00400_preview_vft.sql.
-- Nota: esta es la sobrecarga de 4 argumentos (además de la de 3 args).

create or replace function public.ensure_tracker_membership(
  p_user_id uuid,
  p_email text,
  p_org_id uuid,
  p_role text
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
revoke all on function public.ensure_tracker_membership(uuid, text, uuid, text) from public;
grant execute on function public.ensure_tracker_membership(uuid, text, uuid, text) to anon, authenticated;
