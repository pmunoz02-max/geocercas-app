-- GeoField GPS
-- Corrección permanente del onboarding y materialización de membresías
-- ALCANCE AUTORIZADO: EXCLUSIVAMENTE SUPABASE PREVIEW
--
-- No elimina organizaciones duplicadas.
-- Repara únicamente:
--   org_id  = 976ae17e-7486-4149-96b3-aebbdc476e19
--   user_id = a76f2c25-adc0-4973-af67-f404823fc7b6

begin;

-- ============================================================
-- 1. Preflight: abortar si el entorno no coincide con la
--    estructura y los datos auditados en Preview.
-- ============================================================

do $preflight$
declare
  v_target_org_id constant uuid :=
    '976ae17e-7486-4149-96b3-aebbdc476e19'::uuid;

  v_target_user_id constant uuid :=
    'a76f2c25-adc0-4973-af67-f404823fc7b6'::uuid;

  v_org_count integer;
  v_org_member_count integer;
  v_membership_count integer;
  v_function_definition text;
begin
  if to_regclass('public.organizations') is null
     or to_regclass('public.org_members') is null
     or to_regclass('public.memberships') is null then
    raise exception
      'Preview preflight failed: required membership tables are missing';
  end if;

  if to_regprocedure(
    'public.create_organization_for_current_user(text)'
  ) is null then
    raise exception
      'Preview preflight failed: create_organization_for_current_user(text) is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memberships'
      and column_name = 'is_default'
      and data_type = 'boolean'
      and is_nullable = 'NO'
  ) then
    raise exception
      'Preview preflight failed: memberships.is_default does not match the audited structure';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memberships'
      and column_name = 'revoked_at'
      and data_type = 'timestamp with time zone'
  ) then
    raise exception
      'Preview preflight failed: memberships.revoked_at does not match the audited structure';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.memberships'::regclass
      and conname = 'memberships_pkey'
      and contype = 'p'
      and pg_get_constraintdef(oid, true)
          = 'PRIMARY KEY (org_id, user_id)'
  ) then
    raise exception
      'Preview preflight failed: memberships primary key differs from the audited structure';
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n
      on n.oid = t.typnamespace
    join pg_enum e
      on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'role_type'
      and e.enumlabel = 'owner'
  ) then
    raise exception
      'Preview preflight failed: public.role_type does not contain owner';
  end if;

  select count(*)
  into v_org_count
  from public.organizations
  where id = v_target_org_id
    and owner_id = v_target_user_id
    and name = 'Org Onboarding Preview';

  if v_org_count <> 1 then
    raise exception
      'Preview preflight failed: target onboarding organization does not match the audit';
  end if;

  select count(*)
  into v_org_member_count
  from public.org_members
  where org_id = v_target_org_id
    and user_id = v_target_user_id
    and role = 'owner'
    and is_active is true;

  if v_org_member_count <> 1 then
    raise exception
      'Preview preflight failed: target org_members owner row does not match the audit';
  end if;

  select count(*)
  into v_membership_count
  from public.memberships
  where org_id = v_target_org_id
    and user_id = v_target_user_id;

  if v_membership_count <> 0 then
    raise exception
      'Preview preflight failed: target membership already exists; review before reapplying';
  end if;

  if exists (
    select 1
    from public.memberships
    where user_id = v_target_user_id
      and is_default is true
  ) then
    raise exception
      'Preview preflight failed: target user already has a default membership';
  end if;

  select pg_get_functiondef(
    'public.create_organization_for_current_user(text)'::regprocedure
  )
  into v_function_definition;

  if position(
    'insert into public.org_members' in lower(v_function_definition)
  ) = 0 then
    raise exception
      'Preview preflight failed: RPC no longer matches the audited org_members implementation';
  end if;

  if position(
    'insert into public.memberships' in lower(v_function_definition)
  ) > 0 then
    raise exception
      'Preview preflight failed: RPC already writes memberships; review before reapplying';
  end if;
end;
$preflight$;

-- ============================================================
-- 2. Reparar únicamente la organización válida de onboarding.
-- ============================================================

insert into public.memberships (
  org_id,
  user_id,
  role,
  is_default,
  revoked_at
)
values (
  '976ae17e-7486-4149-96b3-aebbdc476e19'::uuid,
  'a76f2c25-adc0-4973-af67-f404823fc7b6'::uuid,
  'owner'::public.role_type,
  true,
  null
);

-- ============================================================
-- 3. Corregir permanentemente la RPC.
-- ============================================================

create or replace function public.create_organization_for_current_user(
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_name text := btrim(p_name);
  v_make_default boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'Organization name is required'
      using errcode = '22023';
  end if;

  -- Serializa las creaciones realizadas por el mismo usuario.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text, 0)
  );

  -- El índice auditado memberships_one_default_per_user impide
  -- más de una fila is_default=true, incluso si está revocada.
  select not exists (
    select 1
    from public.memberships m
    where m.user_id = v_user_id
      and m.is_default is true
  )
  into v_make_default;

  insert into public.organizations (
    name,
    owner_id
  )
  values (
    v_name,
    v_user_id
  )
  returning id into v_org_id;

  -- Tabla operacional/legacy conservada por compatibilidad.
  -- org_members.role es text en la estructura auditada.
  insert into public.org_members (
    org_id,
    user_id,
    role,
    is_active
  )
  values (
    v_org_id,
    v_user_id,
    'owner',
    true
  )
  on conflict (org_id, user_id)
  do update
  set
    role = excluded.role,
    is_active = true;

  -- Fuente usada por RequireOrg y la autorización actual.
  -- memberships.role utiliza public.role_type.
  insert into public.memberships (
    org_id,
    user_id,
    role,
    is_default,
    revoked_at
  )
  values (
    v_org_id,
    v_user_id,
    'owner'::public.role_type,
    v_make_default,
    null
  )
  on conflict (org_id, user_id)
  do update
  set
    role = excluded.role,
    revoked_at = null,
    is_default = case
      when public.memberships.is_default is true then true
      else excluded.is_default
    end;

  return v_org_id;
end;
$function$;

-- ============================================================
-- 4. Verificaciones internas antes del commit.
-- ============================================================

do $verification$
declare
  v_target_org_id constant uuid :=
    '976ae17e-7486-4149-96b3-aebbdc476e19'::uuid;

  v_target_user_id constant uuid :=
    'a76f2c25-adc0-4973-af67-f404823fc7b6'::uuid;

  v_function_definition text;
begin
  if not exists (
    select 1
    from public.memberships
    where org_id = v_target_org_id
      and user_id = v_target_user_id
      and role = 'owner'::public.role_type
      and is_default is true
      and revoked_at is null
  ) then
    raise exception
      'Post-migration verification failed: repaired owner membership is missing';
  end if;

  if (
    select count(*)
    from public.memberships
    where user_id = v_target_user_id
      and is_default is true
      and revoked_at is null
  ) <> 1 then
    raise exception
      'Post-migration verification failed: user must have exactly one active default membership';
  end if;

  if not exists (
    select 1
    from public.org_members
    where org_id = v_target_org_id
      and user_id = v_target_user_id
      and role = 'owner'
      and is_active is true
  ) then
    raise exception
      'Post-migration verification failed: compatible org_members owner row is missing';
  end if;

  select pg_get_functiondef(
    'public.create_organization_for_current_user(text)'::regprocedure
  )
  into v_function_definition;

  if position(
    'insert into public.org_members' in lower(v_function_definition)
  ) = 0
  or position(
    'insert into public.memberships' in lower(v_function_definition)
  ) = 0 then
    raise exception
      'Post-migration verification failed: RPC does not materialize both membership tables';
  end if;
end;
$verification$;

commit;