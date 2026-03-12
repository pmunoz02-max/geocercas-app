create or replace function public.demo_move_trackers()
returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_org_id uuid;
  v_tracker record;
  v_last_pos record;
  v_waypoints float8[][];
  v_current_idx int;
  v_target_lat float8;
  v_target_lng float8;
  v_delta_lat float8;
  v_delta_lng float8;
  v_new_lat float8;
  v_new_lng float8;
  v_distance float8;
  v_heading float8;
  v_speed float8 := 1.5; -- km/h, bajo para simulación
begin
  -- Obtener org_id del demo
  select id into v_org_id from organizations where slug = 'demo-agro-preview';

  -- Para cada tracker DEMO
  for v_tracker in
    select distinct user_id, personal_id
    from tracker_positions
    where source = 'demo-seed' and org_id = v_org_id
    order by user_id
  loop
    -- Obtener última posición
    select lat, lng into v_last_pos
    from tracker_positions
    where user_id = v_tracker.user_id and source in ('demo-seed', 'demo-live')
    order by recorded_at desc
    limit 1;

    if v_last_pos.lat is null then
      continue;
    end if;

    -- Definir rutas fijas por tracker (basado en user_id)
    if v_tracker.user_id like '111%' then
      -- Ruta 1: alrededor de geocerca 1
      v_waypoints := array[
        array[-0.22985, -78.52495],
        array[-0.23005, -78.52515],
        array[-0.23025, -78.52495],
        array[-0.23005, -78.52475],
        array[-0.22985, -78.52495]
      ];
    elsif v_tracker.user_id like '222%' then
      -- Ruta 2: alrededor de geocerca 2
      v_waypoints := array[
        array[-0.23100, -78.52600],
        array[-0.23120, -78.52620],
        array[-0.23140, -78.52600],
        array[-0.23120, -78.52580],
        array[-0.23100, -78.52600]
      ];
    elsif v_tracker.user_id like '333%' then
      -- Ruta 3: alrededor de geocerca 3
      v_waypoints := array[
        array[-0.23200, -78.52700],
        array[-0.23220, -78.52720],
        array[-0.23240, -78.52700],
        array[-0.23220, -78.52680],
        array[-0.23200, -78.52700]
      ];
    else
      continue;
    end if;

    -- Calcular índice del waypoint actual basado en movimientos previos
    select count(*) % array_length(v_waypoints, 1) into v_current_idx
    from tracker_positions
    where user_id = v_tracker.user_id and source = 'demo-live';

    v_target_lat := v_waypoints[v_current_idx + 1][1];
    v_target_lng := v_waypoints[v_current_idx + 1][2];

    -- Calcular deltas
    v_delta_lat := v_target_lat - v_last_pos.lat;
    v_delta_lng := v_target_lng - v_last_pos.lng;

    -- Calcular distancia aproximada (en grados)
    v_distance := sqrt(v_delta_lat * v_delta_lat + v_delta_lng * v_delta_lng);

    -- Si cerca del target, no mover o ajustar
    if v_distance < 0.0001 then
      -- Avanzar al siguiente waypoint (ya calculado por el count)
      v_new_lat := v_target_lat;
      v_new_lng := v_target_lng;
    else
      -- Interpolación lineal: mover 25% hacia el target
      v_new_lat := v_last_pos.lat + v_delta_lat * 0.25;
      v_new_lng := v_last_pos.lng + v_delta_lng * 0.25;
    end if;

    -- Calcular heading (grados, 0=norte)
    v_heading := degrees(atan2(v_delta_lng * cos(radians(v_last_pos.lat)), v_delta_lat));
    if v_heading < 0 then
      v_heading := v_heading + 360;
    end if;

    -- Insertar nueva posición
    insert into tracker_positions (
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
    ) values (
      v_org_id,
      v_tracker.user_id,
      v_tracker.personal_id,
      v_new_lat,
      v_new_lng,
      10, -- accuracy baja
      v_speed,
      v_heading,
      85, -- battery
      true,
      'demo-live',
      v_now
    );
  end loop;
end;
$$;