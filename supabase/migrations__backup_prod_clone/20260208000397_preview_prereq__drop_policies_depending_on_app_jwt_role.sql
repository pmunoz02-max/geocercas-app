-- Drop policies that depend on public.app_jwt_role() so prereq 00399 can drop/recreate helper functions cleanly

begin;

-- activity_assignments
drop policy if exists aa_sel on public.activity_assignments;

-- activity_rates
drop policy if exists ar_sel on public.activity_rates;

-- position_events
drop policy if exists pe_select on public.position_events;

-- tracker_assignments
drop policy if exists ta_sel on public.tracker_assignments;

-- tenants
drop policy if exists tenants_owner_all on public.tenants;

-- users_public
drop policy if exists up_ins_admin on public.users_public;
drop policy if exists up_ins_owner on public.users_public;
drop policy if exists up_sel_admin on public.users_public;
drop policy if exists up_sel_owner on public.users_public;
drop policy if exists up_upd_admin on public.users_public;
drop policy if exists up_upd_owner on public.users_public;

commit;
