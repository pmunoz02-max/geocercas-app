-- PREVIEW ONLY
-- Establish org_members as the authorization source of truth while retaining
-- memberships and app_user_roles as transitional projections.
--
-- IMPORTANT:
--   * Review and execute only against Supabase Preview.
--   * Do not run in Production.
--   * Do not use this file to activate Paddle Live.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Structural preconditions
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.organizations') is null
     or to_regclass('public.org_members') is null
     or to_regclass('public.memberships') is null
     or to_regclass('public.app_user_roles') is null then
    raise exception
      'Preview authorization migration aborted: required membership tables are missing';
  end if;

  if to_regprocedure('public.is_org_admin(uuid)') is null
     or to_regprocedure('public.is_org_admin(uuid,uuid)') is null then
    raise exception
      'Preview authorization migration aborted: required functions are missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'org_members'
      and column_name = 'is_active'
  ) then
    raise exception
      'Preview authorization migration aborted: org_members.is_active is missing';
  end if;
end;
$$;

lock table public.organizations in share mode;
lock table public.org_members in share row exclusive mode;
lock table public.memberships in share row exclusive mode;
lock table public.app_user_roles in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 2. Backfill the canonical authorization table from valid legacy rows
-- ---------------------------------------------------------------------------

-- Real owner keeps owner, admin keeps admin, and any other legacy role is normalized to tracker.
-- Revoked legacy memberships become inactive canonical memberships.
insert into public.org_members (
  org_id,
  user_id,
  role,
  is_active,
  created_at
)
select
  m.org_id,
  m.user_id,
  case
    when o.owner_id = m.user_id then 'owner'
    when lower(m.role::text) = 'admin' then 'admin'
    else 'tracker'
  end,
  m.revoked_at is null,
  coalesce(m.created_at, now())
from public.memberships m
join public.organizations o
  on o.id = m.org_id
where m.org_id is not null
  and m.user_id is not null
on conflict (org_id, user_id)
do update
set
  role = case
    when exists (
      select 1
      from public.organizations o
      where o.id = excluded.org_id
        and o.owner_id = excluded.user_id
    ) then 'owner'
    when public.org_members.is_active is true
      then public.org_members.role
    else excluded.role
  end,
  is_active = case
    when exists (
      select 1
      from public.organizations o
      where o.id = excluded.org_id
        and o.owner_id = excluded.user_id
    ) then true
    else public.org_members.is_active or excluded.is_active
  end;

-- Every organization owner must have one active canonical owner membership.
insert into public.org_members (
  org_id,
  user_id,
  role,
  is_active,
  created_at
)
select
  o.id,
  o.owner_id,
  'owner',
  true,
  coalesce(o.created_at, now())
from public.organizations o
where o.owner_id is not null
on conflict (org_id, user_id)
do update
set role = 'owner',
    is_active = true;

-- ---------------------------------------------------------------------------
-- 3. Canonical authorization helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_org_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.org_members om
      where om.org_id = p_org_id
        and om.user_id = auth.uid()
        and om.is_active is true
        and lower(om.role::text) in ('owner', 'admin')
    );
$$;

create or replace function public.is_org_admin(
  p_org_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_org_id is not null
    and p_user_id is not null
    and (
      coalesce(auth.role(), '') = 'service_role'
      or auth.uid() = p_user_id
    )
    and exists (
      select 1
      from public.org_members om
      where om.org_id = p_org_id
        and om.user_id = p_user_id
        and om.is_active is true
        and lower(om.role::text) in ('owner', 'admin')
    );
$$;

alter function public.is_org_admin(uuid) owner to postgres;
alter function public.is_org_admin(uuid, uuid) owner to postgres;

revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid, uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated, service_role;
grant execute on function public.is_org_admin(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Canonical projection maintenance
-- ---------------------------------------------------------------------------

create or replace function public.sync_app_user_roles_from_org_members()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.app_user_roles
    where org_id = old.org_id
      and user_id = old.user_id;
    return old;
  end if;

  if new.is_active is true then
    insert into public.app_user_roles (user_id, org_id, role)
    values (new.user_id, new.org_id, lower(new.role::text))
    on conflict (user_id, org_id)
    do update set role = excluded.role;
  else
    delete from public.app_user_roles
    where org_id = new.org_id
      and user_id = new.user_id;
  end if;

  return new;
end;
$$;

alter function public.sync_app_user_roles_from_org_members() owner to postgres;
revoke all on function public.sync_app_user_roles_from_org_members()
  from public, anon, authenticated;
grant execute on function public.sync_app_user_roles_from_org_members()
  to service_role;

drop trigger if exists trg_org_members_sync_app_user_roles
  on public.org_members;

create trigger trg_org_members_sync_app_user_roles
after insert or update of role, is_active or delete
on public.org_members
for each row
execute function public.sync_app_user_roles_from_org_members();

-- Transitional bridge: legacy writers still using memberships must populate
-- org_members. This trigger does not make memberships authoritative; it keeps
-- old writers functional until application code is migrated.
create or replace function public.bridge_memberships_to_org_members()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if tg_op = 'DELETE' then
    update public.org_members
    set is_active = false
    where org_id = old.org_id
      and user_id = old.user_id
      and not exists (
        select 1
        from public.organizations o
        where o.id = old.org_id
          and o.owner_id = old.user_id
      );
    return old;
  end if;

  select o.owner_id
    into v_owner_id
  from public.organizations o
  where o.id = new.org_id;

  insert into public.org_members (
    org_id,
    user_id,
    role,
    is_active,
    created_at
  )
  values (
    new.org_id,
    new.user_id,
    (
      select
        case
          when o.owner_id = m.user_id then 'owner'
          when lower(m.role::text) = 'admin' then 'admin'
          else 'tracker'
        end
      from (
        select
          new.org_id as org_id,
          new.user_id as user_id,
          new.role as role
      ) m
      left join public.organizations o
        on o.id = m.org_id
    ),
    case
      when new.user_id = v_owner_id then true
      else new.revoked_at is null
    end,
    coalesce(new.created_at, now())
  )
  on conflict (org_id, user_id)
  do update
  set
    role = excluded.role,
    is_active = excluded.is_active;

  return new;
end;
$$;

alter function public.bridge_memberships_to_org_members() owner to postgres;
revoke all on function public.bridge_memberships_to_org_members()
  from public, anon, authenticated;
grant execute on function public.bridge_memberships_to_org_members()
  to service_role;

drop trigger if exists trg_memberships_bridge_org_members
  on public.memberships;

create trigger trg_memberships_bridge_org_members
after insert or update of org_id, user_id, role, revoked_at or delete
on public.memberships
for each row
execute function public.bridge_memberships_to_org_members();

-- Rebuild the derived active-role projection from canonical state.
delete from public.app_user_roles aur
where not exists (
  select 1
  from public.org_members om
  where om.org_id = aur.org_id
    and om.user_id = aur.user_id
    and om.is_active is true
);

insert into public.app_user_roles (user_id, org_id, role)
select
  om.user_id,
  om.org_id,
  lower(om.role::text)
from public.org_members om
where om.is_active is true
on conflict (user_id, org_id)
do update set role = excluded.role;

-- ---------------------------------------------------------------------------
-- 5. Close direct privilege-escalation paths
-- ---------------------------------------------------------------------------

drop policy if exists memberships_insert_self on public.memberships;
drop policy if exists memberships_update_own on public.memberships;

-- The unsafe legacy setter is not client-callable during the transition.
-- Active organization selection must use the vetted session/API flow.
-- Preview snapshots do not all contain the same legacy helper set, so each
-- optional helper is hardened only when its audited signature exists.
do $$
begin
  if to_regprocedure(
    'public.gc_set_default_org_for_user(uuid,uuid)'
  ) is not null then
    revoke all on function public.gc_set_default_org_for_user(uuid, uuid)
      from public, anon, authenticated;
    grant execute on function public.gc_set_default_org_for_user(uuid, uuid)
      to service_role;
  end if;

  if to_regprocedure('public.gc_is_member_of_org(uuid,uuid)') is not null then
    revoke all on function public.gc_is_member_of_org(uuid, uuid)
      from public, anon, authenticated;
    grant execute on function public.gc_is_member_of_org(uuid, uuid)
      to service_role;
  end if;

  if to_regprocedure('public.list_user_org_ids(uuid)') is not null then
    revoke all on function public.list_user_org_ids(uuid)
      from public, anon, authenticated;
    grant execute on function public.list_user_org_ids(uuid)
      to service_role;
  end if;
end;
$$;

-- Bootstrap requires an authenticated identity; never expose it to anon.
revoke all on function public.bootstrap_user_context()
  from public, anon;
grant execute on function public.bootstrap_user_context()
  to authenticated, service_role;

-- Sensitive billing and membership writes must use service-backed flows.
revoke insert, update, delete on table public.org_billing
  from anon, authenticated;
revoke insert, update, delete on table public.memberships
  from anon, authenticated;
revoke insert, update, delete on table public.app_user_roles
  from anon, authenticated;

-- Preserve authenticated reads as governed by RLS.
grant select on table public.org_billing to authenticated;
grant select on table public.memberships to authenticated;
grant select on table public.app_user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Postconditions
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing_owner integer;
  v_active_legacy_missing integer;
  v_role_projection_mismatch integer;
  v_inactive_projection integer;
begin
  select count(*)
    into v_missing_owner
  from public.organizations o
  where o.owner_id is not null
    and not exists (
      select 1
      from public.org_members om
      where om.org_id = o.id
        and om.user_id = o.owner_id
        and om.is_active is true
        and lower(om.role::text) = 'owner'
    );

  select count(*)
    into v_active_legacy_missing
  from public.memberships m
  where m.revoked_at is null
    and not exists (
      select 1
      from public.org_members om
      where om.org_id = m.org_id
        and om.user_id = m.user_id
        and om.is_active is true
    );

  select count(*)
    into v_role_projection_mismatch
  from public.org_members om
  left join public.app_user_roles aur
    on aur.org_id = om.org_id
   and aur.user_id = om.user_id
  where om.is_active is true
    and lower(aur.role::text) is distinct from lower(om.role::text);

  select count(*)
    into v_inactive_projection
  from public.org_members om
  join public.app_user_roles aur
    on aur.org_id = om.org_id
   and aur.user_id = om.user_id
  where om.is_active is false;

  if v_missing_owner <> 0
     or v_active_legacy_missing <> 0
     or v_role_projection_mismatch <> 0
     or v_inactive_projection <> 0 then
    raise exception
      'Preview authorization migration postcondition failed: '
      'missing owners=%, active legacy missing=%, role mismatches=%, '
      'inactive projections=%',
      v_missing_owner,
      v_active_legacy_missing,
      v_role_projection_mismatch,
      v_inactive_projection;
  end if;
end;
$$;

commit;
