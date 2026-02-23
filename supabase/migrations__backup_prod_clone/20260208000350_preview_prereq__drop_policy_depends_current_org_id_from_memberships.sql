-- Drop policy that depends on public.current_org_id_from_memberships()
-- so prereq 00399 can drop/recreate helper functions cleanly.

begin;

drop policy if exists app_user_roles_write_by_org_admin on public.app_user_roles;

commit;
