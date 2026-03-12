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

  -- 1.1) Billing DEMO
  insert into public.org_billing (
    org_id,
    plan_code,
    plan_status,
    updated_at,
    over_limit,
    subscribed_plan_code
  )
  values (
    v_demo_org_id,
    'starter',
    'active',
    v_now,
    false,
    'starter'
  )
  on conflict (org_id) do update
    set plan_code = excluded.plan_code,
        subscribed_plan_code = excluded.subscribed_plan_code,
        plan_status = excluded.plan_status,
        updated_at = v_now,
        over_limit = false,
        over_limit_reason = null,
        over_limit_checked_at = v_now;

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
      created_at,
      updated_at,
      org_id,
      vigente,
      position_interval_sec,
      telefono_norm,
      activo_bool,
      is_deleted,
      telefono_raw,
      user_id
    )
    values (
      'Carlos',
      'Mendoza',
      'demo.carlos@preview.local',
      '+593900000001',
      'DEMO-001',
      v_owner_user_id,
      v_now,
      v_now,
      v_demo_org_id,
      true,
      300,
      '+593900000001',
      true,
      false,
      '0990000001',
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
           updated_at = v_now,
           org_id = v_demo_org_id,
           vigente = true,
           position_interval_sec = 300,
           telefono_norm = '+593900000001',
           activo_bool = true,
           is_deleted = false,
           deleted_at = null,
           telefono_raw = '0990000001',
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
      created_at,
      updated_at,
      org_id,
      vigente,
      position_interval_sec,
      telefono_norm,
      activo_bool,
      is_deleted,
      telefono_raw,
      user_id
    )
    values (
      'Lucía',
      'Paredes',
      'demo.lucia@preview.local',
      '+593900000002',
      'DEMO-002',
      v_owner_user_id,
      v_now,
      v_now,
      v_demo_org_id,
      true,
      300,
      '+593900000002',
      true,
      false,
      '0990000002',
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
           updated_at = v_now,
           org_id = v_demo_org_id,
           vigente = true,
           position_interval_sec = 300,
           telefono_norm = '+593900000002',
           activo_bool = true,
           is_deleted = false,
           deleted_at = null,
           telefono_raw = '0990000002',
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
      created_at,
      updated_at,
      org_id,
      vigente,
      position_interval_sec,
      telefono_norm,
      activo_bool,
      is_deleted,
      telefono_raw,
      user_id
    )
    values (
      'Jorge',
      'Saltos',
      'demo.jorge@preview.local',
      '+593900000003',
      'DEMO-003',
      v_owner_user_id,
      v_now,
      v_now,
      v_demo_org_id,
      true,
      300,
      '+593900000003',
      true,
      false,
      '0990000003',
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
           updated_at = v_now,
           org_id = v_demo_org_id,
           vigente = true,
           position_interval_sec = 300,
           telefono_norm = '+593900000003',
           activo_bool = true,
           is_deleted = false,
           deleted_at = null,
           telefono_raw = '0990000003',
           user_id = null
     where id = v_personal_3;
  end if;

  -- 5) Geocercas DEMO (update-or-insert, sin upsert)
  select id
    into v_geocerca_1
  from public.geocercas
  where org_id = v_demo_org_id
    and nombre_ci = 'lote norte'
  limit 1;

  if v_geocerca_1 is null then
    insert into public.geocercas (
      name,
      nombre,
      descripcion,
      usuario_id,
      created_at,
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
      is_deleted,
      updated_at
    )
    values (
      'Lote Norte',
      'Lote Norte',
      'Zona demo de trabajo - lote norte',
      v_owner_user_id,
      v_now,
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
      false,
      v_now
    )
    returning id into v_geocerca_1;
  else
    update public.geocercas
       set name = 'Lote Norte',
           nombre = 'Lote Norte',
           descripcion = 'Zona demo de trabajo - lote norte',
           usuario_id = v_owner_user_id,
           updated_by = v_owner_user_id,
           org_id = v_demo_org_id,
           tenant_id = v_demo_org_id,
           active = true,
           visible = true,
           activa = true,
           activo = true,
           lat = -0.07030,
           lng = -78.46980,
           radius_m = 80,
           geojson = jsonb_build_object(
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
           polygon = jsonb_build_object(
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
           bbox = jsonb_build_object(
             'minLng', -78.47020,
             'minLat', -0.07055,
             'maxLng', -78.46940,
             'maxLat', -0.07005
           ),
           is_deleted = false,
           updated_at = v_now
     where id = v_geocerca_1;
  end if;

  select id
    into v_geocerca_2
  from public.geocercas
  where org_id = v_demo_org_id
    and nombre_ci = 'empaque central'
  limit 1;

  if v_geocerca_2 is null then
    insert into public.geocercas (
      name,
      nombre,
      descripcion,
      usuario_id,
      created_at,
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
      is_deleted,
      updated_at
    )
    values (
      'Empaque Central',
      'Empaque Central',
      'Zona demo de empaque',
      v_owner_user_id,
      v_now,
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
      false,
      v_now
    )
    returning id into v_geocerca_2;
  else
    update public.geocercas
       set name = 'Empaque Central',
           nombre = 'Empaque Central',
           descripcion = 'Zona demo de empaque',
           usuario_id = v_owner_user_id,
           updated_by = v_owner_user_id,
           org_id = v_demo_org_id,
           tenant_id = v_demo_org_id,
           active = true,
           visible = true,
           activa = true,
           activo = true,
           lat = -0.07120,
           lng = -78.46870,
           radius_m = 70,
           geojson = jsonb_build_object(
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
           polygon = jsonb_build_object(
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
           bbox = jsonb_build_object(
             'minLng', -78.46900,
             'minLat', -0.07145,
             'maxLng', -78.46840,
             'maxLat', -0.07100
           ),
           is_deleted = false,
           updated_at = v_now
     where id = v_geocerca_2;
  end if;

  select id
    into v_geocerca_3
  from public.geocercas
  where org_id = v_demo_org_id
    and nombre_ci = 'bodega insumos'
  limit 1;

  if v_geocerca_3 is null then
    insert into public.geocercas (
      name,
      nombre,
      descripcion,
      usuario_id,
      created_at,
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
      is_deleted,
      updated_at
    )
    values (
      'Bodega Insumos',
      'Bodega Insumos',
      'Zona demo de bodega',
      v_owner_user_id,
      v_now,
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
      false,
      v_now
    )
    returning id into v_geocerca_3;
  else
    update public.geocercas
       set name = 'Bodega Insumos',
           nombre = 'Bodega Insumos',
           descripcion = 'Zona demo de bodega',
           usuario_id = v_owner_user_id,
           updated_by = v_owner_user_id,
           org_id = v_demo_org_id,
           tenant_id = v_demo_org_id,
           active = true,
           visible = true,
           activa = true,
           activo = true,
           lat = -0.06950,
           lng = -78.47080,
           radius_m = 60,
           geojson = jsonb_build_object(
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
           polygon = jsonb_build_object(
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
           bbox = jsonb_build_object(
             'minLng', -78.47110,
             'minLat', -0.06975,
             'maxLng', -78.47050,
             'maxLat', -0.06930
           ),
           is_deleted = false,
           updated_at = v_now
     where id = v_geocerca_3;
  end if;

  -- Relación personal -> geocercas
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