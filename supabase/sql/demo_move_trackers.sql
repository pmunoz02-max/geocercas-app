-- preview-only: drop old version when return type changed
-- (does nothing in production due to safety guard later)

DROP FUNCTION IF EXISTS public.demo_move_trackers();

create or replace function public.demo_move_trackers()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_demo_org_id uuid;
  v_now timestamptz := now();
  -- tick increments every second (interval set to 1s in UI)
  v_tick bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  -- one step per segment means each call moves to next waypoint
  v_steps_per_segment integer := 1; -- 1 tick por tramo => movimiento inmediato
  v_rows_inserted integer := 0;
begin
  -- Seguridad: jamás en producción
  if current_setting('app.env', true) = 'production' then
    raise exception 'Demo live movement disabled in production';
  end if;

  select o.id
    into v_demo_org_id
  from public.organizations o
  where o.slug = 'demo-agro-preview'
  limit 1;

  if v_demo_org_id is null then
    raise exception 'No existe la organización demo demo-agro-preview';
  end if;

  with route_defs as (
    select
      '11111111-1111-1111-1111-111111111111'::uuid as tracker_user_id,
      'demo.carlos@preview.local'::text as fallback_email,
      1.2::double precision as nominal_speed,
      -- square route ~0.002° sides for visible movement
      jsonb_build_array(
        jsonb_build_array(-78.47032, -0.07062),
        jsonb_build_array(-78.46832, -0.07062),
        jsonb_build_array(-78.46832, -0.06862),
        jsonb_build_array(-78.47032, -0.06862),
        jsonb_build_array(-78.47032, -0.07062)
      ) as route_points

    union all

    select
      '22222222-2222-2222-2222-222222222222'::uuid,
      'demo.lucia@preview.local'::text,
      1.0::double precision,
      jsonb_build_array(
        jsonb_build_array(-78.46910, -0.07152),
        jsonb_build_array(-78.46710, -0.07152),
        jsonb_build_array(-78.46710, -0.06952),
        jsonb_build_array(-78.46910, -0.06952),
        jsonb_build_array(-78.46910, -0.07152)
      )

    union all

    select
      '33333333-3333-3333-3333-333333333333'::uuid,
      'demo.jorge@preview.local'::text,
      0.95::double precision,
      jsonb_build_array(
        jsonb_build_array(-78.47118, -0.06982),
        jsonb_build_array(-78.46918, -0.06982),
        jsonb_build_array(-78.46918, -0.06782),
        jsonb_build_array(-78.47118, -0.06782),
        jsonb_build_array(-78.47118, -0.06982)
      )
  ),
  latest_state as (
    select distinct on (tp.user_id)
      tp.user_id,
      tp.personal_id,
      tp.battery
    from public.tracker_positions tp
    where tp.org_id = v_demo_org_id
      and tp.user_id in (
        '11111111-1111-1111-1111-111111111111'::uuid,
        '22222222-2222-2222-2222-222222222222'::uuid,
        '33333333-3333-3333-3333-333333333333'::uuid
      )
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
      ((v_tick / v_steps_per_segment) % jsonb_array_length(rd.route_points))::int as segment_idx,
      (((v_tick / v_steps_per_segment) + 1) % jsonb_array_length(rd.route_points))::int as next_idx,
      ((v_tick % v_steps_per_segment)::numeric / v_steps_per_segment::numeric) as segment_progress
    from route_defs rd
    left join latest_state ls
      on ls.user_id = rd.tracker_user_id
  ),
  computed as (
    select
      p.user_id,
      p.personal_id,
      p.battery,
      greatest(0.6, p.nominal_speed) as speed,
      ((p.route_points -> p.segment_idx ->> 0)::double precision) as start_lng,
      ((p.route_points -> p.segment_idx ->> 1)::double precision) as start_lat,
      ((p.route_points -> p.next_idx    ->> 0)::double precision) as end_lng,
      ((p.route_points -> p.next_idx    ->> 1)::double precision) as end_lat,
      p.segment_progress
    from prepared p
    where p.personal_id is not null
  ),
  final_rows as (
    select
      v_demo_org_id as org_id,
      c.user_id,
      c.personal_id,
      (
        c.start_lat + ((c.end_lat - c.start_lat) * c.segment_progress::double precision)
      )::double precision as lat,
      (
        c.start_lng + ((c.end_lng - c.start_lng) * c.segment_progress::double precision)
      )::double precision as lng,
      6::integer as accuracy,
      c.speed,
      mod(
        degrees(atan2(c.end_lng - c.start_lng, c.end_lat - c.start_lat)) + 360.0,
        360.0
      )::double precision as heading,
      greatest(25, least(100, c.battery))::integer as battery,
      true as is_mock,
      'demo-live'::text as source,
      v_now as recorded_at
    from computed c
  )
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
  from final_rows;

  get diagnostics v_rows_inserted = row_count;

  return jsonb_build_object(
    'ok', true,
    'org_id', v_demo_org_id,
    'tick', v_tick,
    'steps_per_segment', v_steps_per_segment,
    'moved', v_rows_inserted,
    'source', 'demo-live',
    'mode', 'walking-route-long'
  );
end;
$$;

grant execute on function public.demo_move_trackers() to authenticated;