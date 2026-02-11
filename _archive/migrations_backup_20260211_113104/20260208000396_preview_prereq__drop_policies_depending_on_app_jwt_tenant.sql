-- Drop policies that depend on public.app_jwt_tenant() so prereq 00399 can drop/recreate helper functions cleanly

begin;

-- activity_assignments
drop policy if exists aa_mod on public.activity_assignments;

-- activity_rates
drop policy if exists ar_mod on public.activity_rates;

-- position_events
drop policy if exists pe_insert on public.position_events;

-- tracker_assignments
drop policy if exists ta_mod on public.tracker_assignments;

commit;
