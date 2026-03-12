do $$

declare
  v_owner_user_id uuid := 'c28a186d-b1df-4eeb-aa55-206f6fb9ac96';
  v_demo_org_id uuid;
  v_now timestamptz := now();

  v_personal_1 uuid;
  v_personal_2 uuid;
  v_personal_3 uuid;

  v_geocerca_1 uuid;
  v_geocerca_2 uuid;
  v_geocerca_3 uuid;

  v_tracker_user_1 uuid := '11111111-1111-1111-1111-111111111111';
  v_tracker_user_2 uuid := '22222222-2222-2222-2222-222222222222';
  v_tracker_user_3 uuid := '33333333-3333-3333-3333-333333333333';

begin

  -- 🔒 Seguridad: evitar ejecución en producción
  if current_setting('app.env', true) = 'production' then
    raise exception 'Demo seed disabled in production';
  end if;

  if v_owner_user_id is null then
    raise exception 'Debes reemplazar v_owner_user_id por un UUID real de profiles.id en Preview';
  end if;

  ----------------------------------------------------------------
  -- 1) Organización DEMO
  ----------------------------------------------------------------

  select id
  into v_demo_org_id
  from public.organizations
  where slug = 'demo-agro-preview'
  limit 1;

  if v_demo_org_id is null then

    insert into public.organizations (
      name,
      slug,
      owner_id,
      created_by,
      created_at,
      updated_at,
      active,
      is_personal
    )
    values (
      'DEMO Agro Preview',
      'demo-agro-preview',
      v_owner_user_id,
      v_owner_user_id,
      v_now,
      v_now,
      true,
      false
    )
    returning id into v_demo_org_id;

  else

    update public.organizations
       set name = 'DEMO Agro Preview',
           owner_id = v_owner_user_id,
           updated_at = v_now,
           active = true
     where id = v_demo_org_id;

  end if;

  if v_demo_org_id is null then
    raise exception 'No se pudo obtener v_demo_org_id';
  end if;

  ----------------------------------------------------------------
  -- 2) Membership owner
  ----------------------------------------------------------------

  insert into public.memberships (
    org_id,
    user_id,
    role,
    is_default
  )
  values (
    v_demo_org_id,
    v_owner_user_id,
    'owner',
    true
  )
  on conflict (org_id, user_id) do update
    set role = 'owner',
        is_default = true,
        revoked_at = null;

  ----------------------------------------------------------------
  -- 3) Profiles apuntando a org demo
  ----------------------------------------------------------------

  update public.profiles
     set org_id = v_demo_org_id,
         default_org_id = v_demo_org_id,
         current_org_id = v_demo_org_id
   where id = v_owner_user_id;

  ----------------------------------------------------------------
  -- 4) Personal demo
  ----------------------------------------------------------------

  insert into public.personal (
    nombre,
    apellido,
    email,
    telefono,
    documento,
    owner_id,
    org_id,
    vigente,
    activo,
    activo_bool,
    position_interval_sec,
    is_deleted
  )
  values
    (
      'Carlos',
      'Mendoza',
      'demo.carlos@preview.local',
      '0990000001',
      'DEMO-001',
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      true,
      300,
      false
    ),
    (
      'Lucía',
      'Paredes',
      'demo.lucia@preview.local',
      '0990000002',
      'DEMO-002',
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      true,
      300,
      false
    ),
    (
      'Jorge',
      'Saltos',
      'demo.jorge@preview.local',
      '0990000003',
      'DEMO-003',
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      true,
      300,
      false
    )
  on conflict do nothing;

  select id into v_personal_1
  from public.personal
  where org_id = v_demo_org_id and email = 'demo.carlos@preview.local'
  limit 1;

  select id into v_personal_2
  from public.personal
  where org_id = v_demo_org_id and email = 'demo.lucia@preview.local'
  limit 1;

  select id into v_personal_3
  from public.personal
  where org_id = v_demo_org_id and email = 'demo.jorge@preview.local'
  limit 1;

  ----------------------------------------------------------------
  -- 5) Geocercas demo
  ----------------------------------------------------------------

  insert into public.geocercas (
    name,
    nombre,
    descripcion,
    usuario_id,
    created_by,
    updated_by,
    org_id,
    active,
    visible,
    lat,
    lng,
    radius_m
  )
  values
    (
      'Lote Norte',
      'Lote Norte',
      'Zona demo de trabajo',
      v_owner_user_id,
      v_owner_user_id,
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      -0.07030,
      -78.46980,
      80
    ),
    (
      'Empaque Central',
      'Empaque Central',
      'Zona demo de empaque',
      v_owner_user_id,
      v_owner_user_id,
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      -0.07120,
      -78.46870,
      70
    ),
    (
      'Bodega Insumos',
      'Bodega Insumos',
      'Zona demo de bodega',
      v_owner_user_id,
      v_owner_user_id,
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      -0.06950,
      -78.47080,
      60
    )
  on conflict do nothing;

  ----------------------------------------------------------------
  -- 6) Limpiar posiciones demo
  ----------------------------------------------------------------

  delete from public.tracker_positions
   where org_id = v_demo_org_id
     and user_id in (
       v_tracker_user_1,
       v_tracker_user_2,
       v_tracker_user_3
     );

  ----------------------------------------------------------------
  -- 7) Insertar posiciones demo
  ----------------------------------------------------------------

  insert into public.tracker_positions (
    org_id,
    user_id,
    personal_id,
    lat,
    lng,
    accuracy,
    speed,
    heading,
    battery,
    is_mock,
    source,
    recorded_at
  )
  select
    v_demo_org_id,
    v_tracker_user_1,
    v_personal_1,
    (-0.07048 + (g.n * 0.000030)),
    (-78.47010 + (g.n * 0.000040)),
    8 + (g.n % 5),
    1.2,
    90,
    87 - g.n,
    true,
    'demo-seed',
    v_now - ((12 - g.n) * interval '5 minutes')
  from generate_series(0,11) as g(n);

  raise notice 'DEMO V1 OK. org_id=%', v_demo_org_id;

end $$;