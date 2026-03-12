create or replace function public.load_demo_preview_dataset(p_org_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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
  -- Seguridad: jamás en producción
  if current_setting('app.env', true) = 'production' then
    raise exception 'Demo seed disabled in production';
  end if;

  if v_owner_user_id is null then
    raise exception 'v_owner_user_id no configurado';
  end if;

  -- 1) Organización DEMO
  select o.id
    into v_demo_org_id
  from public.organizations o
  where o.slug = 'demo-agro-preview'
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
           active = true,
           suspended = false,
           is_personal = false
     where id = v_demo_org_id;
  end if;

  if v_demo_org_id is null then
    raise exception 'No se pudo obtener v_demo_org_id';
  end if;

  -- 2) Membership owner
  update public.memberships
     set is_default = false
   where user_id = v_owner_user_id
     and is_default = true
     and org_id <> v_demo_org_id;

  insert into public.memberships (
    org_id,
    user_id,
    role,
    is_default,
    revoked_at
  )
  values (
    v_demo_org_id,
    v_owner_user_id,
    'owner',
    true,
    null
  )
  on conflict (org_id, user_id) do update
    set role = excluded.role,
        is_default = true,
        revoked_at = null;

  -- 3) Profile del owner apuntando a la org demo
  update public.profiles
     set org_id = v_demo_org_id,
         default_org_id = v_demo_org_id,
         current_org_id = v_demo_org_id
   where id = v_owner_user_id;

  -- 4) Personal DEMO
  select id into v_personal_1
  from public.personal
  where org_id = v_demo_org_id
    and lower(email) = 'demo.carlos@preview.local'
  limit 1;

  if v_personal_1 is null then
    insert into public.personal (
      nombre,
      apellido,
      email,
      telefono,
      documento,
      owner_id,
      org_id,
      vigente,
      activo_bool,
      position_interval_sec,
      is_deleted,
      email_norm,
      phone_norm,
      telefono_norm,
      telefono_raw,
      identity_key,
      user_id
    )
    values (
      'Carlos',
      'Mendoza',
      'demo.carlos@preview.local',
      '+593900000001',
      'DEMO-001',
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      300,
      false,
      'demo.carlos@preview.local',
      '+593900000001',
      '+593900000001',
      '0990000001',
      'demo.carlos@preview.local',
      null
    )
    returning id into v_personal_1;
  else
    update public.personal
       set nombre = 'Carlos',
           apellido = 'Mendoza',
           email = 'demo.carlos@preview.local',
           telefono = '+593900000001',
           documento = 'DEMO-001',
           owner_id = v_owner_user_id,
           org_id = v_demo_org_id,
           vigente = true,
           activo_bool = true,
           position_interval_sec = 300,
           is_deleted = false,
           deleted_at = null,
           email_norm = 'demo.carlos@preview.local',
           phone_norm = '+593900000001',
           telefono_norm = '+593900000001',
           telefono_raw = '0990000001',
           identity_key = 'demo.carlos@preview.local',
           user_id = null
     where id = v_personal_1;
  end if;

  select id into v_personal_2
  from public.personal
  where org_id = v_demo_org_id
    and lower(email) = 'demo.lucia@preview.local'
  limit 1;

  if v_personal_2 is null then
    insert into public.personal (
      nombre,
      apellido,
      email,
      telefono,
      documento,
      owner_id,
      org_id,
      vigente,
      activo_bool,
      position_interval_sec,
      is_deleted,
      email_norm,
      phone_norm,
      telefono_norm,
      telefono_raw,
      identity_key,
      user_id
    )
    values (
      'Lucía',
      'Paredes',
      'demo.lucia@preview.local',
      '+593900000002',
      'DEMO-002',
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      300,
      false,
      'demo.lucia@preview.local',
      '+593900000002',
      '+593900000002',
      '0990000002',
      'demo.lucia@preview.local',
      null
    )
    returning id into v_personal_2;
  else
    update public.personal
       set nombre = 'Lucía',
           apellido = 'Paredes',
           email = 'demo.lucia@preview.local',
           telefono = '+593900000002',
           documento = 'DEMO-002',
           owner_id = v_owner_user_id,
           org_id = v_demo_org_id,
           vigente = true,
           activo_bool = true,
           position_interval_sec = 300,
           is_deleted = false,
           deleted_at = null,
           email_norm = 'demo.lucia@preview.local',
           phone_norm = '+593900000002',
           telefono_norm = '+593900000002',
           telefono_raw = '0990000002',
           identity_key = 'demo.lucia@preview.local',
           user_id = null
     where id = v_personal_2;
  end if;

  select id into v_personal_3
  from public.personal
  where org_id = v_demo_org_id
    and lower(email) = 'demo.jorge@preview.local'
  limit 1;

  if v_personal_3 is null then
    insert into public.personal (
      nombre,
      apellido,
      email,
      telefono,
      documento,
      owner_id,
      org_id,
      vigente,
      activo_bool,
      position_interval_sec,
      is_deleted,
      email_norm,
      phone_norm,
      telefono_norm,
      telefono_raw,
      identity_key,
      user_id
    )
    values (
      'Jorge',
      'Saltos',
      'demo.jorge@preview.local',
      '+593900000003',
      'DEMO-003',
      v_owner_user_id,
      v_demo_org_id,
      true,
      true,
      300,
      false,
      'demo.jorge@preview.local',
      '+593900000003',
      '+593900000003',
      '0990000003',
      'demo.jorge@preview.local',
      null
    )
    returning id into v_personal_3;
  else
    update public.personal
       set nombre = 'Jorge',
           apellido = 'Saltos',
           email = 'demo.jorge@preview.local',
           telefono = '+593900000003',
           documento = 'DEMO-003',
           owner_id = v_owner_user_id,
           org_id = v_demo_org_id,
           vigente = true,
           activo_bool = true,
           position_interval_sec = 300,
           is_deleted = false,
           deleted_at = null,
           email_norm = 'demo.jorge@preview.local',
           phone_norm = '+593900000003',
           telefono_norm = '+593900000003',
           telefono_raw = '0990000003',
           identity_key = 'demo.jorge@preview.local',
           user_id = null
     where id = v_personal_3;
  end if;

  -- 5) Geocercas DEMO
  insert into public.geocercas (
    name,
    nombre,
    nombre_ci,
    descripcion,
    usuario_id,
    created_by,
    updated_by,
    org_id,
    tenant_id,
    active,
    visible,
    activa,
    activo,
    lat,
    lng,
    radius_m,
    geojson,
    polygon,
    bbox,
    is_deleted
  )
  values (
    'Lote Norte',
    'Lote Norte',
    'lote norte',
    'Zona demo de trabajo - lote norte',
    v_owner_user_id,
    v_owner_user_id,
    v_owner_user_id,
    v_demo_org_id,
    v_demo_org_id,
    true,
    true,
    true,
    true,
    -0.07030,
    -78.46980,
    80,
    jsonb_build_object(
      'type','Feature',
      'geometry', jsonb_build_object(
        'type','Polygon',
        'coordinates', jsonb_build_array(
          jsonb_build_array(
            jsonb_build_array(-78.47020,-0.07055),
            jsonb_build_array(-78.46940,-0.07055),
            jsonb_build_array(-78.46940,-0.07005),
            jsonb_build_array(-78.47020,-0.07005),
            jsonb_build_array(-78.47020,-0.07055)
          )
        )
      ),
      'properties', jsonb_build_object('name','Lote Norte')
    ),
    jsonb_build_object(
      'type','Polygon',
      'coordinates', jsonb_build_array(
        jsonb_build_array(
          jsonb_build_array(-78.47020,-0.07055),
          jsonb_build_array(-78.46940,-0.07055),
          jsonb_build_array(-78.46940,-0.07005),
          jsonb_build_array(-78.47020,-0.07005),
          jsonb_build_array(-78.47020,-0.07055)
        )
      )
    ),
    jsonb_build_object(
      'minLng', -78.47020,
      'minLat', -0.07055,
      'maxLng', -78.46940,
      'maxLat', -0.07005
    ),
    false
  )
  on conflict (org_id, nombre_ci) do update
    set name = excluded.name,
        nombre = excluded.nombre,
        descripcion = excluded.descripcion,
        usuario_id = excluded.usuario_id,
        created_by = excluded.created_by,
        updated_by = excluded.updated_by,
        tenant_id = excluded.tenant_id,
        active = true,
        visible = true,
        activa = true,
        activo = true,
        lat = excluded.lat,
        lng = excluded.lng,
        radius_m = excluded.radius_m,
        geojson = excluded.geojson,
        polygon = excluded.polygon,
        bbox = excluded.bbox,
        is_deleted = false,
        updated_at = v_now;

  insert into public.geocercas (
    name,
    nombre,
    nombre_ci,
    descripcion,
    usuario_id,
    created_by,
    updated_by,
    org_id,
    tenant_id,
    active,
    visible,
    activa,
    activo,
    lat,
    lng,
    radius_m,
    geojson,
    polygon,
    bbox,
    is_deleted
  )
  values (
    'Empaque Central',
    'Empaque Central',
    'empaque central',
    'Zona demo de empaque',
    v_owner_user_id,
    v_owner_user_id,
    v_owner_user_id,
    v_demo_org_id,
    v_demo_org_id,
    true,
    true,
    true,
    true,
    -0.07120,
    -78.46870,
    70,
    jsonb_build_object(
      'type','Feature',
      'geometry', jsonb_build_object(
        'type','Polygon',
        'coordinates', jsonb_build_array(
          jsonb_build_array(
            jsonb_build_array(-78.46900,-0.07145),
            jsonb_build_array(-78.46840,-0.07145),
            jsonb_build_array(-78.46840,-0.07100),
            jsonb_build_array(-78.46900,-0.07100),
            jsonb_build_array(-78.46900,-0.07145)
          )
        )
      ),
      'properties', jsonb_build_object('name','Empaque Central')
    ),
    jsonb_build_object(
      'type','Polygon',
      'coordinates', jsonb_build_array(
        jsonb_build_array(
          jsonb_build_array(-78.46900,-0.07145),
          jsonb_build_array(-78.46840,-0.07145),
          jsonb_build_array(-78.46840,-0.07100),
          jsonb_build_array(-78.46900,-0.07100),
          jsonb_build_array(-78.46900,-0.07145)
        )
      )
    ),
    jsonb_build_object(
      'minLng', -78.46900,
      'minLat', -0.07145,
      'maxLng', -78.46840,
      'maxLat', -0.07100
    ),
    false
  )
  on conflict (org_id, nombre_ci) do update
    set name = excluded.name,
        nombre = excluded.nombre,
        descripcion = excluded.descripcion,
        usuario_id = excluded.usuario_id,
        created_by = excluded.created_by,
        updated_by = excluded.updated_by,
        tenant_id = excluded.tenant_id,
        active = true,
        visible = true,
        activa = true,
        activo = true,
        lat = excluded.lat,
        lng = excluded.lng,
        radius_m = excluded.radius_m,
        geojson = excluded.geojson,
        polygon = excluded.polygon,
        bbox = excluded.bbox,
        is_deleted = false,
        updated_at = v_now;

  insert into public.geocercas (
    name,
    nombre,
    nombre_ci,
    descripcion,
    usuario_id,
    created_by,
    updated_by,
    org_id,
    tenant_id,
    active,
    visible,
    activa,
    activo,
    lat,
    lng,
    radius_m,
    geojson,
    polygon,
    bbox,
    is_deleted
  )
  values (
    'Bodega Insumos',
    'Bodega Insumos',
    'bodega insumos',
    'Zona demo de bodega',
    v_owner_user_id,
    v_owner_user_id,
    v_owner_user_id,
    v_demo_org_id,
    v_demo_org_id,
    true,
    true,
    true,
    true,
    -0.06950,
    -78.47080,
    60,
    jsonb_build_object(
      'type','Feature',
      'geometry', jsonb_build_object(
        'type','Polygon',
        'coordinates', jsonb_build_array(
          jsonb_build_array(
            jsonb_build_array(-78.47110,-0.06975),
            jsonb_build_array(-78.47050,-0.06975),
            jsonb_build_array(-78.47050,-0.06930),
            jsonb_build_array(-78.47110,-0.06930),
            jsonb_build_array(-78.47110,-0.06975)
          )
        )
      ),
      'properties', jsonb_build_object('name','Bodega Insumos')
    ),
    jsonb_build_object(
      'type','Polygon',
      'coordinates', jsonb_build_array(
        jsonb_build_array(
          jsonb_build_array(-78.47110,-0.06975),
          jsonb_build_array(-78.47050,-0.06975),
          jsonb_build_array(-78.47050,-0.06930),
          jsonb_build_array(-78.47110,-0.06930),
          jsonb_build_array(-78.47110,-0.06975)
        )
      )
    ),
    jsonb_build_object(
      'minLng', -78.47110,
      'minLat', -0.06975,
      'maxLng', -78.47050,
      'maxLat', -0.06930
    ),
    false
  )
  on conflict (org_id, nombre_ci) do update
    set name = excluded.name,
        nombre = excluded.nombre,
        descripcion = excluded.descripcion,
        usuario_id = excluded.usuario_id,
        created_by = excluded.created_by,
        updated_by = excluded.updated_by,
        tenant_id = excluded.tenant_id,
        active = true,
        visible = true,
        activa = true,
        activo = true,
        lat = excluded.lat,
        lng = excluded.lng,
        radius_m = excluded.radius_m,
        geojson = excluded.geojson,
        polygon = excluded.polygon,
        bbox = excluded.bbox,
        is_deleted = false,
        updated_at = v_now;

  select id into v_geocerca_1
  from public.geocercas
  where org_id = v_demo_org_id
    and nombre_ci = 'lote norte'
  limit 1;

  select id into v_geocerca_2
  from public.geocercas
  where org_id = v_demo_org_id
    and nombre_ci = 'empaque central'
  limit 1;

  select id into v_geocerca_3
  from public.geocercas
  where org_id = v_demo_org_id
    and nombre_ci = 'bodega insumos'
  limit 1;

  if v_geocerca_1 is not null then
    update public.geocercas
       set personal_ids = array[v_personal_1]::uuid[],
           updated_at = v_now
     where id = v_geocerca_1;
  end if;

  if v_geocerca_2 is not null then
    update public.geocercas
       set personal_ids = array[v_personal_2]::uuid[],
           updated_at = v_now
     where id = v_geocerca_2;
  end if;

  if v_geocerca_3 is not null then
    update public.geocercas
       set personal_ids = array[v_personal_3]::uuid[],
           updated_at = v_now
     where id = v_geocerca_3;
  end if;

  -- 6) Limpiar posiciones DEMO previas
  delete from public.tracker_positions
   where org_id = v_demo_org_id
     and (
       user_id in (v_tracker_user_1, v_tracker_user_2, v_tracker_user_3)
       or source in ('demo-seed', 'demo-live', 'demo_seed_v2', 'demo_seed_v3')
     );

  -- 7) Insertar posiciones DEMO recientes
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
  from generate_series(0, 11) as g(n)

  union all

  select
    v_demo_org_id,
    v_tracker_user_2,
    v_personal_2,
    (-0.07138 + (g.n * 0.000025)),
    (-78.46892 + (g.n * 0.000030)),
    7 + (g.n % 4),
    0.8,
    45,
    92 - g.n,
    true,
    'demo-seed',
    v_now - ((12 - g.n) * interval '5 minutes')
  from generate_series(0, 11) as g(n)

  union all

  select
    v_demo_org_id,
    v_tracker_user_3,
    v_personal_3,
    (-0.06968 + (g.n * 0.000020)),
    (-78.47098 + (g.n * 0.000025)),
    6 + (g.n % 3),
    0.6,
    135,
    78 - g.n,
    true,
    'demo-seed',
    v_now - ((12 - g.n) * interval '5 minutes')
  from generate_series(0, 11) as g(n);

  return jsonb_build_object(
    'ok', true,
    'org_id', v_demo_org_id,
    'message', 'DEMO loaded',
    'positions', 36,
    'trackers', 3,
    'geocercas', 3
  );
end;
$$;

grant execute on function public.load_demo_preview_dataset(uuid) to authenticated;