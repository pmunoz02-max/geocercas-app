begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.rpc_create_tracker_pairing_code(
  p_org_id uuid,
  p_personal_id uuid,
  p_code_hash text,
  p_created_by_user_id uuid,
  p_expires_hours integer default 72,
  p_email text default null,
  p_max_uses integer default 1,
  p_revoke_existing boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_email_norm text;
  v_code_id uuid;
  v_expires_at timestamptz;
begin
  if p_org_id is null then
    return jsonb_build_object('ok', false, 'error', 'org_id_required');
  end if;

  if p_personal_id is null then
    return jsonb_build_object('ok', false, 'error', 'personal_id_required');
  end if;

  if p_code_hash is null or length(trim(p_code_hash)) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code_hash');
  end if;

  if p_created_by_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'created_by_required');
  end if;

  if coalesce(p_expires_hours, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_expires_hours');
  end if;

  if coalesce(p_max_uses, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_max_uses');
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_created_by_user_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden_actor_mismatch');
  end if;

  if not public.is_org_admin(p_org_id, p_created_by_user_id) then
    return jsonb_build_object('ok', false, 'error', 'admin_required');
  end if;

  if not exists (
    select 1
    from public.personal p
    where p.id = p_personal_id
      and p.org_id = p_org_id
      and coalesce(p.is_deleted, false) = false
  ) then
    return jsonb_build_object('ok', false, 'error', 'personal_not_found');
  end if;

  v_email_norm := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_expires_at := now() + make_interval(hours => p_expires_hours);

  if p_revoke_existing then
    update public.tracker_pairing_codes
    set
      active = false,
      revoked_at = coalesce(revoked_at, now()),
      revoked_by = coalesce(revoked_by, p_created_by_user_id)
    where org_id = p_org_id
      and personal_id = p_personal_id
      and active = true
      and revoked_at is null
      and use_count < max_uses;
  end if;

  insert into public.tracker_pairing_codes (
    org_id,
    personal_id,
    email,
    email_norm,
    code_hash,
    code_version,
    active,
    max_uses,
    use_count,
    expires_at,
    created_by
  )
  values (
    p_org_id,
    p_personal_id,
    nullif(trim(coalesce(p_email, '')), ''),
    v_email_norm,
    trim(p_code_hash),
    1,
    true,
    p_max_uses,
    0,
    v_expires_at,
    p_created_by_user_id
  )
  returning id into v_code_id;

  return jsonb_build_object(
    'ok', true,
    'pairing_code_id', v_code_id,
    'org_id', p_org_id,
    'personal_id', p_personal_id,
    'expires_at', v_expires_at,
    'max_uses', p_max_uses
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'pairing_code_conflict');
  when others then
    return jsonb_build_object('ok', false, 'error', 'unexpected_error', 'details', sqlerrm);
end;
$$;


create or replace function public.rpc_claim_tracker_pairing_code(
  p_code_hash text,
  p_tracker_user_id uuid,
  p_tracker_email text default null,
  p_runtime_expires_hours integer default 720
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_code public.tracker_pairing_codes%rowtype;
  v_tracker_email_norm text;
  v_runtime_token text;
  v_runtime_token_hash text;
  v_existing_personal_id uuid;
begin
  if p_code_hash is null or length(trim(p_code_hash)) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code_hash');
  end if;

  if p_tracker_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'tracker_user_id_required');
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_tracker_user_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden_actor_mismatch');
  end if;

  if coalesce(p_runtime_expires_hours, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_runtime_expires_hours');
  end if;

  v_tracker_email_norm := nullif(lower(trim(coalesce(p_tracker_email, ''))), '');

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
    return jsonb_build_object('ok', false, 'error', 'pairing_code_not_found');
  end if;

  if v_code.expires_at <= now() then
    update public.tracker_pairing_codes
    set active = false
    where id = v_code.id;

    return jsonb_build_object('ok', false, 'error', 'pairing_code_expired');
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
    return jsonb_build_object('ok', false, 'error', 'personal_not_found');
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
    return jsonb_build_object('ok', false, 'error', 'personal_already_linked_to_other_user');
  end if;

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
    'tracker'::public.role_type,
    now(),
    false,
    null
  )
  on conflict (org_id, user_id)
  do update
     set role = case
                  when public.memberships.role in ('owner'::public.role_type, 'admin'::public.role_type)
                    then public.memberships.role
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
    'tracker',
    now(),
    true
  )
  on conflict (org_id, user_id)
  do update
     set role = case
                  when public.org_members.role in ('owner', 'admin')
                    then public.org_members.role
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
    'TRACKER',
    now()
  )
  on conflict (org_id, user_id)
  do update
     set role = case
                  when public.user_organizations.role in ('OWNER', 'ADMIN')
                    then public.user_organizations.role
                  else 'TRACKER'
                end;

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
  v_runtime_token_hash := encode(extensions.digest(v_runtime_token, 'sha256'), 'hex');

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
    'runtime_expires_at', now() + make_interval(hours => p_runtime_expires_hours)
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'claim_conflict');
  when others then
    return jsonb_build_object('ok', false, 'error', 'unexpected_error', 'details', sqlerrm);
end;
$$;

grant execute on function public.rpc_create_tracker_pairing_code(
  uuid,
  uuid,
  text,
  uuid,
  integer,
  text,
  integer,
  boolean
) to authenticated, service_role;

grant execute on function public.rpc_claim_tracker_pairing_code(
  text,
  uuid,
  text,
  integer
) to authenticated, service_role;

comment on function public.rpc_create_tracker_pairing_code(
  uuid,
  uuid,
  text,
  uuid,
  integer,
  text,
  integer,
  boolean
) is
'Creates a hashed tracker pairing code for a selected person in an organization. Raw code is generated outside DB and never stored.';

comment on function public.rpc_claim_tracker_pairing_code(
  text,
  uuid,
  text,
  integer
) is
'Claims a tracker pairing code after Magic Link authentication, links personal.user_id, creates tracker memberships, and issues runtime token.';

commit;