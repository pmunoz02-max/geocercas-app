drop function if exists public.demo_move_trackers();

create or replace function public.demo_move_trackers()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_demo_org_id uuid;
  v_now timestamptz := now();

  -- 1 tick cada 1 segundo
  v_tick bigint := floor(extract(epoch from clock_timestamp()))::bigint;

  -- 30 pasos por segmento => movimiento extremadamente suave, tipo caminata real para grabación en pantalla
  v_steps_per_segment integer := 30;

  v_rows_inserted integer := 0;
begin
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
      jsonb_build_array(
        jsonb_build_array(-78.47032, -0.07062),
        jsonb_build_array(-78.46990, -0.07055),
        jsonb_build_array(-78.46930, -0.07040),
        jsonb_build_array(-78.46880, -0.07010),
        jsonb_build_array(-78.46870, -0.06955),
        jsonb_build_array(-78.46905, -0.06910),
        jsonb_build_array(-78.46965, -0.06895),
        jsonb_build_array(-78.47015, -0.06920),
        jsonb_build_array(-78.47035, -0.06975),
        jsonb_build_array(-78.47032, -0.07062)
      ) as route_points

    union all

    select
      '22222222-2222-2222-2222-222222222222'::uuid,
      'demo.lucia@preview.local'::text,
      1.0::double precision,
      jsonb_build_array(
        jsonb_build_array(-78.46910, -0.07152),
        jsonb_build_array(-78.46870, -0.07145),
        jsonb_build_array(-78.46810, -0.07130),
        jsonb_build_array(-78.46755, -0.07095),
        jsonb_build_array(-78.46745, -0.07035),
        jsonb_build_array(-78.46785, -0.06990),
        jsonb_build_array(-78.46845, -0.06978),
        jsonb_build_array(-78.46895, -0.07005),
        jsonb_build_array(-78.46912, -0.07062),
        jsonb_build_array(-78.46910, -0.07152)
      )

    union all

    select
      '33333333-3333-3333-3333-333333333333'::uuid,
      'demo.jorge@preview.local'::text,
      0.95::double precision,
      jsonb_build_array(
        jsonb_build_array(-78.47118, -0.06982),
        jsonb_build_array(-78.47075, -0.06978),
        jsonb_build_array(-78.47015, -0.06965),
        jsonb_build_array(-78.46960, -0.06930),
        jsonb_build_array(-78.46948, -0.06875),
        jsonb_build_array(-78.46985, -0.06830),
        jsonb_build_array(-78.47045, -0.06818),
        jsonb_build_array(-78.47098, -0.06842),
        jsonb_build_array(-78.47118, -0.06900),
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
      floor((v_tick::numeric / v_steps_per_segment))::bigint as route_tick
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
      (p.route_tick % p.route_len)::int as segment_idx,
      ((p.route_tick + 1) % p.route_len)::int as next_idx,
      ((v_tick % v_steps_per_segment)::numeric / v_steps_per_segment::numeric)::double precision as segment_progress,
      p.route_points
    from prepared p
    where p.personal_id is not null
  ),
  final_rows as (
    select
      v_demo_org_id as org_id,
      c.user_id,
      c.personal_id,
      (
        ((c.route_points -> c.segment_idx ->> 1)::double precision) +
        (
          (((c.route_points -> c.next_idx ->> 1)::double precision) -
           ((c.route_points -> c.segment_idx ->> 1)::double precision)
          ) * c.segment_progress
        )
      )::double precision as lat,
      (
        ((c.route_points -> c.segment_idx ->> 0)::double precision) +
        (
          (((c.route_points -> c.next_idx ->> 0)::double precision) -
           ((c.route_points -> c.segment_idx ->> 0)::double precision)
          ) * c.segment_progress
        )
      )::double precision as lng,
      6::integer as accuracy,
      c.speed,
      mod(
        degrees(
          atan2(
            ((c.route_points -> c.next_idx ->> 0)::double precision) -
            ((c.route_points -> c.segment_idx ->> 0)::double precision),
            ((c.route_points -> c.next_idx ->> 1)::double precision) -
            ((c.route_points -> c.segment_idx ->> 1)::double precision)
          )
        ) + 360.0,
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
    'mode', 'walking-route-smooth'
  );
end;
$$;

grant execute on function public.demo_move_trackers() to authenticated;

notify pgrst, 'reload schema';