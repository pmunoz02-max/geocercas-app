-- Drop policies that depend on public._is_root_claim() so prereq 00399 can drop/recreate helper functions cleanly

begin;

-- Organizations policies (depend on _is_root_claim)
drop policy if exists org_delete_owner_only on public.organizations;
drop policy if exists org_insert_owner_self on public.organizations;
drop policy if exists org_select_owner_or_member on public.organizations;
drop policy if exists org_update_owner_only on public.organizations;

commit;
