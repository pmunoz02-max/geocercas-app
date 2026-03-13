create or replace function public.demo_move_trackers()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_demo_org_id uuid;
  v_now timestamptz := now();

  -- Más alto = más lento
  v_tick double precision := extract(epoch from clock_timestamp()) / 16;

  -- Segmentos visibles pero lentos
  v_steps_per_segment integer := 6;

  -- Curvatura lateral para que no se vea línea recta
  v_curve_amplitude_deg double precision := 0.00014;

  v_rows_inserted integer := 0;
  v_events_inserted integer := 0;
  v_position_id uuid;
  v_row record;
begin
  if current_setting('app.env', true) = 'production' then
    raise exception 'Demo live movement disabled in production';
  end if;

  select id
    into v_demo_org_id
  from public.organizations
  where slug = 'demo-agro-preview'
  limit 1;

  if v_demo_org_id is null then
    raise exception 'No existe la organización demo demo-agro-preview';
  end if;

  for v_row in
    with route_defs as (

      select
        '11111111-1111-1111-1111-111111111111'::uuid as tracker_user_id,
        'demo.carlos@preview.local'::text as fallback_email,
        0.12::double precision as nominal_speed,
        jsonb_build_array(
          jsonb_build_array(-78.47100,-0.06900),
          jsonb_build_array(-78.47020,-0.06872),
          jsonb_build_array(-78.46930,-0.06918),
          jsonb_build_array(-78.46830,-0.06870),
          jsonb_build_array(-78.46740,-0.06922),
          jsonb_build_array(-78.46650,-0.06878),
          jsonb_build_array(-78.46710,-0.06955),
          jsonb_build_array(-78.46810,-0.06905),
          jsonb_build_array(-78.46910,-0.06962),
          jsonb_build_array(-78.47010,-0.06908),
          jsonb_build_array(-78.47110,-0.06970),
          jsonb_build_array(-78.47180,-0.06918),
          jsonb_build_array(-78.47120,-0.07010),
          jsonb_build_array(-78.47000,-0.06955),
          jsonb_build_array(-78.46890,-0.07018),
          jsonb_build_array(-78.46780,-0.06958),
          jsonb_build_array(-78.46690,-0.07015),
          jsonb_build_array(-78.46780,-0.06935),
          jsonb_build_array(-78.46900,-0.06995),
          jsonb_build_array(-78.47020,-0.06928),
          jsonb_build_array(-78.47100,-0.06900)
        ) as route_points

      union all

      select
        '22222222-2222-2222-2222-222222222222'::uuid,
        'demo.lucia@preview.local'::text,
        0.11::double precision,
        jsonb_build_array(
          jsonb_build_array(-78.46850,-0.07200),
          jsonb_build_array(-78.46910,-0.07130),
          jsonb_build_array(-78.46820,-0.07070),
          jsonb_build_array(-78.46930,-0.07005),
          jsonb_build_array(-78.46810,-0.06945),
          jsonb_build_array(-78.46920,-0.06885),
          jsonb_build_array(-78.46830,-0.06835),
          jsonb_build_array(-78.46780,-0.06905),
          jsonb_build_array(-78.46890,-0.06970),
          jsonb_build_array(-78.46790,-0.07030),
          jsonb_build_array(-78.46900,-0.07095),
          jsonb_build_array(-78.46810,-0.07155),
          jsonb_build_array(-78.46910,-0.07195),
          jsonb_build_array(-78.46850,-0.07200)
        ) as route_points

      union all

      select
        '33333333-3333-3333-3333-333333333333'::uuid,
        'demo.jorge@preview.local'::text,
        0.10::double precision,
        jsonb_build_array(
          jsonb_build_array(-78.46500,-0.07300),
          jsonb_build_array(-78.46610,-0.07230),
          jsonb_build_array(-78.46560,-0.07155),
          jsonb_build_array(-78.46710,-0.07100),
          jsonb_build_array(-78.46630,-0.07035),
          jsonb_build_array(-78.46810,-0.06995),
          jsonb_build_array(-78.46710,-0.07075),
          jsonb_build_array(-78.46900,-0.07120),
          jsonb_build_array(-78.46820,-0.07025),
          jsonb_build_array(-78.47000,-0.07070),
          jsonb_build_array(-78.46910,-0.07155),
          jsonb_build_array(-78.46780,-0.07215),
          jsonb_build_array(-78.46660,-0.07275),
          jsonb_build_array(-78.46500,-0.07300)
        ) as route_points
    ),

    latest_state as (
      select distinct on (tp.user_id)
        tp.user_id,
        tp.personal_id,
        tp.battery
      from public.tracker_positions tp
      where tp.org_id = v_demo_org_id
      order by tp.user_id, tp.recorded_at desc
    ),

    prepared as (
      select
        rd.tracker_user_id as user_id,
        coalesce(
          ls.personal_id,
          (
            select p.id
            from public.personal p
            where p.org_id = v_demo_org_id
              and lower(p.email) = lower(rd.fallback_email)
            limit 1
          )
        ) as personal_id,
        coalesce(ls.battery, 88) as battery,
        rd.nominal_speed,
        rd.route_points,
        jsonb_array_length(rd.route_points) as route_len,
        floor(v_tick / v_steps_per_segment) as route_tick
      from route_defs rd
      left join latest_state ls
        on ls.user_id = rd.tracker_user_id
    ),

    computed as (
      select
        p.user_id,
        p.personal_id,
        p.battery,
        p.nominal_speed as speed,
        (p.route_tick % (p.route_len - 1))::int as segment_idx,
        ((p.route_tick % (p.route_len - 1)) + 1)::int as next_idx,
        ((v_tick % v_steps_per_segment) / v_steps_per_segment)::double precision as segment_progress,
        p.route_points
      from prepared p
      where p.personal_id is not null
        and p.route_len >= 2
    ),

    geom as (
      select
        c.user_id,
        c.personal_id,
        c.battery,
        c.speed,
        c.segment_idx,
        c.next_idx,
        c.segment_progress,
        (c.route_points -> c.segment_idx ->> 0)::double precision as curr_lng,
        (c.route_points -> c.segment_idx ->> 1)::double precision as curr_lat,
        (c.route_points -> c.next_idx ->> 0)::double precision as next_lng,
        (c.route_points -> c.next_idx ->> 1)::double precision as next_lat,
        (
          (c.route_points -> c.next_idx ->> 0)::double precision -
          (c.route_points -> c.segment_idx ->> 0)::double precision
        ) as dx_lng,
        (
          (c.route_points -> c.next_idx ->> 1)::double precision -
          (c.route_points -> c.segment_idx ->> 1)::double precision
        ) as dy_lat,
        case
          when mod(c.segment_idx, 2) = 0 then 1.0
          else -1.0
        end as zig_sign
      from computed c
    ),

    final_rows as (
      select
        v_demo_org_id as org_id,
        g.user_id,
        g.personal_id,

        (
          g.curr_lat +
          (g.dy_lat * g.segment_progress) +
          (
            case
              when sqrt(power(g.dx_lng, 2) + power(g.dy_lat, 2)) > 0
              then (g.dx_lng / sqrt(power(g.dx_lng, 2) + power(g.dy_lat, 2)))
                   * sin(pi() * g.segment_progress)
                   * v_curve_amplitude_deg
                   * g.zig_sign
              else 0
            end
          )
        )::double precision as lat,

        (
          g.curr_lng +
          (g.dx_lng * g.segment_progress) +
          (
            case
              when sqrt(power(g.dx_lng, 2) + power(g.dy_lat, 2)) > 0
              then ((-1.0 * g.dy_lat) / sqrt(power(g.dx_lng, 2) + power(g.dy_lat, 2)))
                   * sin(pi() * g.segment_progress)
                   * v_curve_amplitude_deg
                   * g.zig_sign
              else 0
            end
          )
        )::double precision as lng,

        6::integer as accuracy,
        g.speed,

        case
          when degrees(atan2(g.dx_lng, g.dy_lat)) < 0
          then (degrees(atan2(g.dx_lng, g.dy_lat)) + 360.0)::double precision
          else degrees(atan2(g.dx_lng, g.dy_lat))::double precision
        end as heading,

        greatest(25, least(100, g.battery))::integer as battery,
        true as is_mock,
        'demo-live'::text as source,
        v_now as recorded_at
      from geom g
    )

    select *
    from final_rows
  loop
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
    values (
      v_row.org_id,
      v_row.user_id,
      v_row.personal_id,
      v_row.lat,
      v_row.lng,
      v_row.accuracy,
      v_row.speed,
      v_row.heading,
      v_row.battery,
      v_row.is_mock,
      v_row.source,
      v_row.recorded_at
    )
    returning id into v_position_id;

    v_rows_inserted := v_rows_inserted + 1;
    v_events_inserted := v_events_inserted + public.sync_tracker_geofence_events_for_position(v_position_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'org_id', v_demo_org_id,
    'steps_per_segment', v_steps_per_segment,
    'curve_amplitude_deg', v_curve_amplitude_deg,
    'moved', v_rows_inserted,
    'events', v_events_inserted,
    'source', 'demo-live',
    'mode', 'walking-route-time-curved'
  );
end;
$function$;