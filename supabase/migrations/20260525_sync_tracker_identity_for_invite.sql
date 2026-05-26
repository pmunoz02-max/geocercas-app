-- Permanent tracker identity sync before sending tracker invitations.
-- Fixes cases where auth.users exists but public.personal.user_id is still null,
-- and ensures a tracker membership exists for the inviting organization.

drop function if exists public.sync_tracker_identity_for_invite(uuid, text);

create or replace function public.sync_tracker_identity_for_invite(
  p_org_id uuid,
  p_email text
)
returns table (
  ok boolean,
  code text,
  auth_user_id uuid,
  updated_personal_count integer,
  membership_role public.role_type
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_auth_user_id uuid;
  v_updated_count integer := 0;
  v_membership_role public.role_type;
begin
  if p_org_id is null or v_email = '' then
    return query
    select
      false,
      'invalid_input',
      null::uuid,
      0,
      null::public.role_type;
    return;
  end if;

  select u.id
    into v_auth_user_id
  from auth.users u
  where lower(u.email) = v_email
  order by u.created_at asc
  limit 1;

  if v_auth_user_id is null then
    return query
    select
      false,
      'auth_user_not_found',
      null::uuid,
      0,
      null::public.role_type;
    return;
  end if;

  update public.personal p
  set
    user_id = v_auth_user_id,
    updated_at = now()
  where p.org_id = p_org_id
    and lower(p.email) = v_email
    and p.user_id is null
    and coalesce(p.is_deleted, false) = false
    and coalesce(p.vigente, true) = true;

  get diagnostics v_updated_count = row_count;

  if not exists (
    select 1
    from public.personal p
    where p.org_id = p_org_id
      and lower(p.email) = v_email
      and p.user_id = v_auth_user_id
      and coalesce(p.is_deleted, false) = false
      and coalesce(p.vigente, true) = true
  ) then
    return query
    select
      false,
      'personal_not_linked',
      v_auth_user_id,
      v_updated_count,
      null::public.role_type;
    return;
  end if;

  insert into public.memberships (
    org_id,
    user_id,
    role,
    is_default,
    revoked_at
  )
  values (
    p_org_id,
    v_auth_user_id,
    'tracker'::public.role_type,
    false,
    null
  )
  on conflict (org_id, user_id)
  do update set
    revoked_at = null,
    role = case
      when public.memberships.role in ('owner'::public.role_type, 'admin'::public.role_type)
        then public.memberships.role
      else 'tracker'::public.role_type
    end;

  select m.role
    into v_membership_role
  from public.memberships m
  where m.org_id = p_org_id
    and m.user_id = v_auth_user_id;

  return query
  select
    true,
    'synced',
    v_auth_user_id,
    v_updated_count,
    v_membership_role;
end;
$$;

revoke all on function public.sync_tracker_identity_for_invite(uuid, text) from public;
revoke all on function public.sync_tracker_identity_for_invite(uuid, text) from anon;
revoke all on function public.sync_tracker_identity_for_invite(uuid, text) from authenticated;

grant execute on function public.sync_tracker_identity_for_invite(uuid, text) to service_role;