-- PREVIEW ONLY — CONTROLLED FALLBACK
--
-- This is intentionally not a vulnerability-restoring rollback.
-- It disables only the new transitional synchronization bridges.
-- It does NOT restore:
--   * is_org_admin = true
--   * self-insert/self-update membership policies
--   * public execution of unsafe UUID-accepting helpers
--   * direct authenticated writes to billing/membership projections
--
-- Use only if the new bridge triggers cause an operational regression.

begin;

drop trigger if exists trg_memberships_bridge_org_members
  on public.memberships;

drop trigger if exists trg_org_members_sync_app_user_roles
  on public.org_members;

-- Keep the functions installed but unreachable by application roles so a
-- later audited migration can inspect or reuse them.
revoke all on function public.bridge_memberships_to_org_members()
  from public, anon, authenticated;
revoke all on function public.sync_app_user_roles_from_org_members()
  from public, anon, authenticated;

commit;
