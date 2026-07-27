-- READ ONLY — PREVIEW
-- Run after 20260727190000_membership_authorization_source_preview.sql.

with checks as (
  select
    '01_ORG_OWNER_WITHOUT_CANONICAL_OWNER'::text as check_name,
    count(*)::bigint as failures
  from public.organizations o
  where o.owner_id is not null
    and not exists (
      select 1
      from public.org_members om
      where om.org_id = o.id
        and om.user_id = o.owner_id
        and om.is_active is true
        and lower(om.role::text) = 'owner'
    )

  union all

  select
    '02_ACTIVE_LEGACY_WITHOUT_ACTIVE_CANONICAL',
    count(*)
  from public.memberships m
  where m.revoked_at is null
    and not exists (
      select 1
      from public.org_members om
      where om.org_id = m.org_id
        and om.user_id = m.user_id
        and om.is_active is true
    )

  union all

  select
    '03_ACTIVE_CANONICAL_ROLE_PROJECTION_MISMATCH',
    count(*)
  from public.org_members om
  left join public.app_user_roles aur
    on aur.org_id = om.org_id
   and aur.user_id = om.user_id
  where om.is_active is true
    and lower(aur.role::text) is distinct from lower(om.role::text)

  union all

  select
    '04_INACTIVE_CANONICAL_STILL_PROJECTED',
    count(*)
  from public.org_members om
  join public.app_user_roles aur
    on aur.org_id = om.org_id
   and aur.user_id = om.user_id
  where om.is_active is false

  union all

  select
    '05_FALSE_CANONICAL_OWNER',
    count(*)
  from public.org_members om
  join public.organizations o
    on o.id = om.org_id
  where om.is_active is true
    and lower(om.role::text) = 'owner'
    and om.user_id is distinct from o.owner_id
)
select
  check_name,
  failures,
  case when failures = 0 then 'PASS' else 'FAIL' end as result
from checks
order by check_name;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_org_admin',
    'gc_set_default_org_for_user',
    'gc_is_member_of_org',
    'list_user_org_ids',
    'bootstrap_user_context'
  )
order by p.proname, arguments;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'org_members',
    'memberships',
    'app_user_roles',
    'org_billing'
  )
order by c.relname;

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'trg_org_members_sync_app_user_roles',
    'trg_memberships_bridge_org_members'
  )
order by trigger_name, event_manipulation;
