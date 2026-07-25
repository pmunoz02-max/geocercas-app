-- PREVIEW ONLY
-- Emergency hardening of canonical memberships and tracker pairing.
-- This migration intentionally does not implement ownership transfer yet.

begin;

-- ---------------------------------------------------------------------------
-- 1. Abort unless the audited Preview structures exist.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.memberships') is null
     or to_regclass('public.organizations') is null
     or to_regclass('public.org_members') is null
     or to_regclass('public.user_organizations') is null
     or to_regclass('public.app_user_roles') is null
     or to_regclass('public.personal') is null
     or to_regclass('public.tracker_positions') is null
     or to_regclass('public.tracker_runtime_sessions') is null
     or to_regclass('public.tracker_pairing_codes') is null then
    raise exception
      'Preview membership emergency migration aborted: required tables are missing';
  end if;

  if to_regprocedure('public.is_org_admin(uuid)') is null
     or to_regprocedure('public.is_org_admin(uuid,uuid)') is null
     or to_regprocedure(
       'public.rpc_claim_tracker_pairing_code(text,uuid,text,integer)'
     ) is null
     or to_regprocedure('public.ensure_tracker_membership(text,uuid,text)') is null
     or to_regprocedure(
       'public.ensure_tracker_membership(uuid,text,uuid,text)'
     ) is null then
    raise exception
      'Preview membership emergency migration aborted: required functions are missing';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Repair the authorization helpers.
--    SECURITY DEFINER is required because these helpers are used by RLS on
--    memberships itself. The owner is postgres and the search_path is fixed.
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
    and (
      exists (
        select 1
        from public.organizations o
        where o.id = p_org_id
          and o.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.memberships m
        where m.org_id = p_org_id
          and m.user_id = auth.uid()
          and m.revoked_at is null
          and m.role::text in ('owner', 'admin')
          and (
            m.role::text <> 'owner'
            or exists (
              select 1
              from public.organizations o
              where o.id = m.org_id
                and o.owner_id = m.user_id
            )
          )
      )
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
      exists (
        select 1
        from public.organizations o
        where o.id = p_org_id
          and o.owner_id = p_user_id
      )
      or exists (
        select 1
        from public.memberships m
        where m.org_id = p_org_id
          and m.user_id = p_user_id
          and m.revoked_at is null
          and m.role::text in ('owner', 'admin')
          and (
            m.role::text <> 'owner'
            or exists (
              select 1
              from public.organizations o
              where o.id = m.org_id
                and o.owner_id = m.user_id
            )
          )
      )
    );
$$;

alter function public.is_org_admin(uuid) owner to postgres;
alter function public.is_org_admin(uuid, uuid) owner to postgres;

revoke all on function public.is_org_admin(uuid) from public;
revoke all on function public.is_org_admin(uuid, uuid) from public;
revoke all on function public.is_org_admin(uuid) from anon;
revoke all on function public.is_org_admin(uuid, uuid) from anon;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid, uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to service_role;
grant execute on function public.is_org_admin(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Replace the global "no downgrade" rule with owner-integrity protection.
--    It blocks false owners and protects the real owner's active membership,
--    while allowing legitimate admin/tracker/viewer role changes.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_prevent_membership_downgrade
  on public.memberships;

create or replace function public.enforce_membership_owner_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if tg_op = 'DELETE' then
    select o.owner_id
      into v_owner_id
    from public.organizations o
    where o.id = old.org_id;

    if old.user_id = v_owner_id
       and old.revoked_at is null
       and old.role::text = 'owner' then
      raise exception
        'The active membership of the organization owner cannot be deleted'
        using errcode = '23514';
    end if;

    return old;
  end if;

  select o.owner_id
    into v_owner_id
  from public.organizations o
  where o.id = new.org_id;

  if v_owner_id is null then
    raise exception
      'Membership requires an existing organization with an owner'
      using errcode = '23503';
  end if;

  if new.revoked_at is null
     and new.role::text = 'owner'
     and new.user_id is distinct from v_owner_id then
    raise exception
      'Only organizations.owner_id may have an active owner membership'
      using errcode = '23514';
  end if;

  if new.user_id = v_owner_id
     and (
       new.revoked_at is not null
       or new.role::text <> 'owner'
     ) then
    raise exception
      'The organization owner must retain an active owner membership'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.enforce_membership_owner_integrity() owner to postgres;
revoke all on function public.enforce_membership_owner_integrity()
  from public, anon, authenticated;
grant execute on function public.enforce_membership_owner_integrity()
  to service_role;

create trigger trg_memberships_owner_integrity_insert
before insert on public.memberships
for each row
execute function public.enforce_membership_owner_integrity();

create trigger trg_memberships_owner_integrity_update
before update of org_id, user_id, role, revoked_at on public.memberships
for each row
execute function public.enforce_membership_owner_integrity();

create trigger trg_memberships_owner_integrity_delete
before delete on public.memberships
for each row
execute function public.enforce_membership_owner_integrity();

-- Keep the old function name unavailable to application roles. It is no
-- longer attached to memberships.
revoke all on function public.prevent_membership_downgrade()
  from public, anon, authenticated;
grant execute on function public.prevent_membership_downgrade()
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Close self-write RLS paths. Users may read their own membership, but
--    writes must go through an authorized admin policy or a vetted RPC.
-- ---------------------------------------------------------------------------

drop policy if exists memberships_insert_self on public.memberships;
drop policy if exists memberships_update_own on public.memberships;

drop policy if exists memberships_insert_admin on public.memberships;
create policy memberships_insert_admin
on public.memberships
for insert
to authenticated
with check (
  org_id is not null
  and public.is_org_admin(org_id)
);

drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin
on public.memberships
for update
to authenticated
using (public.is_org_admin(org_id))
with check (public.is_org_admin(org_id));

drop policy if exists memberships_delete_admin on public.memberships;
create policy memberships_delete_admin
on public.memberships
for delete
to authenticated
using (public.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- 5. Replace the tracker pairing RPC in full.
--    Claiming a tracker identity results in tracker in this organization,
--    except when that same user is organizations.owner_id.
-- ---------------------------------------------------------------------------

create or replace function public.rpc_claim_tracker_pairing_code(
  p_code_hash text,
  p_tracker_user_id uuid,
  p_tracker_email text default null::text,
  p_runtime_expires_hours integer default 720
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code public.tracker_pairing_codes%rowtype;
  v_tracker_email_norm text;
  v_runtime_token text;
  v_runtime_token_hash text;
  v_existing_personal_id uuid;
  v_is_actual_owner boolean;
begin
  if p_code_hash is null or length(trim(p_code_hash)) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code_hash');
  end if;

  if p_tracker_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'tracker_user_id_required'
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_tracker_user_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'forbidden_actor_mismatch'
    );
  end if;

  if coalesce(p_runtime_expires_hours, 0) < 1 then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_runtime_expires_hours'
    );
  end if;

  v_tracker_email_norm :=
    nullif(lower(trim(coalesce(p_tracker_email, ''))), '');

  select *
    into v_code
  from public.tracker_pairing_codes
  where code_hash = trim(p_code_hash)
    and active = true
    and revoked_at is null
    and use_count < max_uses
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'pairing_code_not_found'
    );
  end if;

  if v_code.expires_at <= now() then
    update public.tracker_pairing_codes
    set active = false
    where id = v_code.id;

    return jsonb_build_object(
      'ok', false,
      'error', 'pairing_code_expired'
    );
  end if;

  if v_code.email_norm is not null
     and v_tracker_email_norm is not null
     and v_code.email_norm <> v_tracker_email_norm then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  if not exists (
    select 1
    from public.personal p
    where p.id = v_code.personal_id
      and p.org_id = v_code.org_id
      and coalesce(p.is_deleted, false) = false
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'personal_not_found'
    );
  end if;

  select p.id
    into v_existing_personal_id
  from public.personal p
  where p.org_id = v_code.org_id
    and p.user_id = p_tracker_user_id
    and p.id <> v_code.personal_id
    and coalesce(p.is_deleted, false) = false
  limit 1;

  if v_existing_personal_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'tracker_user_already_linked_to_other_personal',
      'existing_personal_id', v_existing_personal_id
    );
  end if;

  if exists (
    select 1
    from public.personal p
    where p.id = v_code.personal_id
      and p.user_id is not null
      and p.user_id <> p_tracker_user_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'personal_already_linked_to_other_user'
    );
  end if;

  select exists (
    select 1
    from public.organizations o
    where o.id = v_code.org_id
      and o.owner_id = p_tracker_user_id
  )
  into v_is_actual_owner;

  update public.personal
  set
    user_id = p_tracker_user_id,
    updated_at = now()
  where id = v_code.personal_id
    and org_id = v_code.org_id;

  insert into public.memberships (
    org_id,
    user_id,
    role,
    created_at,
    is_default,
    revoked_at
  )
  values (
    v_code.org_id,
    p_tracker_user_id,
    case
      when v_is_actual_owner then 'owner'::public.role_type
      else 'tracker'::public.role_type
    end,
    now(),
    false,
    null
  )
  on conflict (org_id, user_id)
  do update
     set role = case
                  when v_is_actual_owner
                    then 'owner'::public.role_type
                  else 'tracker'::public.role_type
                end,
         revoked_at = null;

  insert into public.org_members (
    org_id,
    user_id,
    role,
    created_at,
    is_active
  )
  values (
    v_code.org_id,
    p_tracker_user_id,
    case when v_is_actual_owner then 'owner' else 'tracker' end,
    now(),
    true
  )
  on conflict (org_id, user_id)
  do update
     set role = case
                  when v_is_actual_owner then 'owner'
                  else 'tracker'
                end,
         is_active = true;

  insert into public.user_organizations (
    user_id,
    org_id,
    role,
    created_at
  )
  values (
    p_tracker_user_id,
    v_code.org_id,
    case when v_is_actual_owner then 'OWNER' else 'TRACKER' end,
    now()
  )
  on conflict (org_id, user_id)
  do update
     set role = case
                  when v_is_actual_owner then 'OWNER'
                  else 'TRACKER'
                end;

  insert into public.app_user_roles (
    user_id,
    org_id,
    role
  )
  values (
    p_tracker_user_id,
    v_code.org_id,
    case
      when v_is_actual_owner then 'owner'
      else 'tracker'
    end
  )
  on conflict (user_id, org_id)
  do update
     set role = excluded.role;

  update public.tracker_runtime_sessions
  set
    active = false,
    revoked_at = coalesce(revoked_at, now()),
    updated_at = now()
  where org_id = v_code.org_id
    and tracker_user_id = p_tracker_user_id
    and active = true
    and revoked_at is null;

  v_runtime_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_runtime_token_hash :=
    encode(extensions.digest(v_runtime_token, 'sha256'), 'hex');

  insert into public.tracker_runtime_sessions (
    org_id,
    tracker_user_id,
    access_token_hash,
    token_version,
    source,
    active,
    issued_at,
    expires_at
  )
  values (
    v_code.org_id,
    p_tracker_user_id,
    v_runtime_token_hash,
    1,
    'tracker_pairing_code',
    true,
    now(),
    now() + make_interval(hours => p_runtime_expires_hours)
  );

  update public.tracker_pairing_codes
  set
    use_count = use_count + 1,
    used_at = coalesce(used_at, now()),
    used_by_user_id = coalesce(used_by_user_id, p_tracker_user_id),
    active = case
               when use_count + 1 >= max_uses then false
               else true
             end
  where id = v_code.id;

  return jsonb_build_object(
    'ok', true,
    'org_id', v_code.org_id,
    'personal_id', v_code.personal_id,
    'tracker_user_id', p_tracker_user_id,
    'tracker_runtime_token', v_runtime_token,
    'tracker_access_token', v_runtime_token,
    'runtime_expires_at',
    now() + make_interval(hours => p_runtime_expires_hours)
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'claim_conflict');
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', 'unexpected_error',
      'details', sqlerrm
    );
end;
$$;

alter function public.rpc_claim_tracker_pairing_code(
  text,
  uuid,
  text,
  integer
) owner to postgres;

comment on function public.rpc_claim_tracker_pairing_code(
  text,
  uuid,
  text,
  integer
) is
  'Claims a tracker pairing code after authentication, enforces the canonical '
  'role for the inviting organization, links personal.user_id, and issues a '
  'runtime token.';

revoke all on function public.rpc_claim_tracker_pairing_code(
  text,
  uuid,
  text,
  integer
) from public, anon;
grant execute on function public.rpc_claim_tracker_pairing_code(
  text,
  uuid,
  text,
  integer
) to authenticated, service_role;

-- Legacy bridge helpers are service-only. They can write org_members with a
-- caller-supplied role and therefore must not be directly callable by clients.
revoke all on function public.ensure_tracker_membership(
  text,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.ensure_tracker_membership(
  uuid,
  text,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.ensure_tracker_membership(
  text,
  uuid,
  text
) to service_role;
grant execute on function public.ensure_tracker_membership(
  uuid,
  text,
  uuid,
  text
) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Identify the two audited anomalies without embedding IDs.
-- ---------------------------------------------------------------------------

create temporary table emergency_membership_repairs (
  repair_type text primary key,
  org_id uuid not null,
  user_id uuid not null,
  unique (org_id, user_id)
) on commit drop;

insert into emergency_membership_repairs (
  repair_type,
  org_id,
  user_id
)
select
  'TRACKER_FALSE_OWNER',
  m.org_id,
  m.user_id
from public.memberships m
join public.organizations o
  on o.id = m.org_id
where m.revoked_at is null
  and m.role::text = 'owner'
  and m.user_id is distinct from o.owner_id
  and o.is_personal is true
  and exists (
    select 1
    from public.personal p
    where p.org_id = m.org_id
      and p.user_id = m.user_id
      and coalesce(p.is_deleted, false) = false
  )
  and (
    select count(*)
    from public.tracker_positions tp
    where tp.org_id = m.org_id
      and tp.user_id = m.user_id
  ) = 42
  and exists (
    select 1
    from public.tracker_runtime_sessions trs
    where trs.org_id = m.org_id
      and trs.tracker_user_id = m.user_id
  )
  and exists (
    select 1
    from public.org_members om
    where om.org_id = m.org_id
      and om.user_id = m.user_id
      and om.role = 'tracker'
      and om.is_active is true
  )
  and exists (
    select 1
    from public.app_user_roles aur
    where aur.org_id = m.org_id
      and aur.user_id = m.user_id
      and aur.role::text = 'tracker'
  )
  and not exists (
    select 1
    from public.user_organizations uo
    where uo.org_id = m.org_id
      and uo.user_id = m.user_id
  );

insert into emergency_membership_repairs (
  repair_type,
  org_id,
  user_id
)
select
  'ORPHAN_FALSE_OWNER',
  m.org_id,
  m.user_id
from public.memberships m
join public.organizations o
  on o.id = m.org_id
where m.revoked_at is null
  and m.role::text = 'owner'
  and m.user_id is distinct from o.owner_id
  and o.is_personal is false
  and not exists (
    select 1
    from public.personal p
    where p.org_id = m.org_id
      and p.user_id = m.user_id
      and coalesce(p.is_deleted, false) = false
  )
  and not exists (
    select 1
    from public.tracker_positions tp
    where tp.org_id = m.org_id
      and tp.user_id = m.user_id
  )
  and not exists (
    select 1
    from public.tracker_runtime_sessions trs
    where trs.org_id = m.org_id
      and trs.tracker_user_id = m.user_id
  )
  and not exists (
    select 1
    from public.tracker_pairing_codes tpc
    where tpc.org_id = m.org_id
      and tpc.used_by_user_id = m.user_id
  )
  and not exists (
    select 1
    from public.org_members om
    where om.org_id = m.org_id
      and om.user_id = m.user_id
  )
  and not exists (
    select 1
    from public.user_organizations uo
    where uo.org_id = m.org_id
      and uo.user_id = m.user_id
  )
  and not exists (
    select 1
    from public.app_user_roles aur
    where aur.org_id = m.org_id
      and aur.user_id = m.user_id
  );

do $$
declare
  v_tracker_count integer;
  v_orphan_count integer;
  v_all_false_owners integer;
begin
  select count(*)
    into v_tracker_count
  from emergency_membership_repairs
  where repair_type = 'TRACKER_FALSE_OWNER';

  select count(*)
    into v_orphan_count
  from emergency_membership_repairs
  where repair_type = 'ORPHAN_FALSE_OWNER';

  select count(*)
    into v_all_false_owners
  from public.memberships m
  join public.organizations o
    on o.id = m.org_id
  where m.revoked_at is null
    and m.role::text = 'owner'
    and m.user_id is distinct from o.owner_id;

  if v_tracker_count <> 1
     or v_orphan_count <> 1
     or v_all_false_owners <> 2 then
    raise exception
      'Preview membership emergency migration aborted: expected exactly '
      '1 tracker false-owner, 1 orphan false-owner and 2 false-owners total; '
      'found %, % and %',
      v_tracker_count,
      v_orphan_count,
      v_all_false_owners;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Apply the two evidence-based repairs and align their legacy projections.
-- ---------------------------------------------------------------------------

update public.memberships m
set
  role = 'tracker'::public.role_type,
  revoked_at = null
from emergency_membership_repairs r
where r.repair_type = 'TRACKER_FALSE_OWNER'
  and m.org_id = r.org_id
  and m.user_id = r.user_id;

update public.org_members om
set
  role = 'tracker',
  is_active = true
from emergency_membership_repairs r
where r.repair_type = 'TRACKER_FALSE_OWNER'
  and om.org_id = r.org_id
  and om.user_id = r.user_id;

insert into public.user_organizations (
  user_id,
  org_id,
  role,
  created_at
)
select
  r.user_id,
  r.org_id,
  'TRACKER',
  now()
from emergency_membership_repairs r
where r.repair_type = 'TRACKER_FALSE_OWNER'
on conflict (org_id, user_id)
do update set role = 'TRACKER';

insert into public.app_user_roles (
  user_id,
  org_id,
  role
)
select
  r.user_id,
  r.org_id,
  'tracker'
from emergency_membership_repairs r
where r.repair_type = 'TRACKER_FALSE_OWNER'
on conflict (user_id, org_id)
do update set role = excluded.role;

update public.memberships m
set
  revoked_at = now(),
  is_default = false
from emergency_membership_repairs r
where r.repair_type = 'ORPHAN_FALSE_OWNER'
  and m.org_id = r.org_id
  and m.user_id = r.user_id;

-- Align the actual owners of the two affected organizations.
insert into public.memberships (
  org_id,
  user_id,
  role,
  created_at,
  is_default,
  revoked_at
)
select
  o.id,
  o.owner_id,
  'owner'::public.role_type,
  coalesce(o.created_at, now()),
  false,
  null
from public.organizations o
where exists (
  select 1
  from emergency_membership_repairs r
  where r.org_id = o.id
)
on conflict (org_id, user_id)
do update
set
  role = 'owner'::public.role_type,
  revoked_at = null;

insert into public.org_members (
  org_id,
  user_id,
  role,
  created_at,
  is_active
)
select
  o.id,
  o.owner_id,
  'owner',
  coalesce(o.created_at, now()),
  true
from public.organizations o
where exists (
  select 1
  from emergency_membership_repairs r
  where r.org_id = o.id
)
on conflict (org_id, user_id)
do update
set
  role = 'owner',
  is_active = true;

insert into public.user_organizations (
  user_id,
  org_id,
  role,
  created_at
)
select
  o.owner_id,
  o.id,
  'OWNER',
  coalesce(o.created_at, now())
from public.organizations o
where exists (
  select 1
  from emergency_membership_repairs r
  where r.org_id = o.id
)
on conflict (org_id, user_id)
do update set role = 'OWNER';

insert into public.app_user_roles (
  user_id,
  org_id,
  role
)
select
  o.owner_id,
  o.id,
  'owner'
from public.organizations o
where exists (
  select 1
  from emergency_membership_repairs r
  where r.org_id = o.id
)
on conflict (user_id, org_id)
do update set role = excluded.role;

-- A revoked membership can never remain the default.
update public.memberships
set is_default = false
where revoked_at is not null
  and is_default is true;

-- ---------------------------------------------------------------------------
-- 8. Postconditions. Any mismatch rolls back the whole transaction.
-- ---------------------------------------------------------------------------

do $$
declare
  v_false_owners integer;
  v_invalid_actual_owners integer;
  v_revoked_defaults integer;
  v_tracker_repairs integer;
  v_orphan_repairs integer;
begin
  select count(*)
    into v_false_owners
  from public.memberships m
  join public.organizations o
    on o.id = m.org_id
  where m.revoked_at is null
    and m.role::text = 'owner'
    and m.user_id is distinct from o.owner_id;

  select count(*)
    into v_invalid_actual_owners
  from public.organizations o
  where not exists (
    select 1
    from public.memberships m
    where m.org_id = o.id
      and m.user_id = o.owner_id
      and m.revoked_at is null
      and m.role::text = 'owner'
  );

  select count(*)
    into v_revoked_defaults
  from public.memberships m
  where m.revoked_at is not null
    and m.is_default is true;

  select count(*)
    into v_tracker_repairs
  from emergency_membership_repairs r
  join public.memberships m
    on m.org_id = r.org_id
   and m.user_id = r.user_id
  where r.repair_type = 'TRACKER_FALSE_OWNER'
    and m.revoked_at is null
    and m.role::text = 'tracker';

  select count(*)
    into v_orphan_repairs
  from emergency_membership_repairs r
  join public.memberships m
    on m.org_id = r.org_id
   and m.user_id = r.user_id
  where r.repair_type = 'ORPHAN_FALSE_OWNER'
    and m.revoked_at is not null
    and m.is_default is false;

  if v_false_owners <> 0
     or v_invalid_actual_owners <> 0
     or v_revoked_defaults <> 0
     or v_tracker_repairs <> 1
     or v_orphan_repairs <> 1 then
    raise exception
      'Preview membership emergency migration postcondition failed: '
      'false owners=%, invalid actual owners=%, revoked defaults=%, '
      'tracker repairs=%, orphan repairs=%',
      v_false_owners,
      v_invalid_actual_owners,
      v_revoked_defaults,
      v_tracker_repairs,
      v_orphan_repairs;
  end if;
end;
$$;

commit;
