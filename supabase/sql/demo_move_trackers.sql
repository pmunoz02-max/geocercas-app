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

  -- 80 pasos por segmento => movimiento extremadamente suave, tipo caminata humana lenta para grabación en pantalla
  v_steps_per_segment integer := 80;

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
      0.35::double precision as nominal_speed,
      jsonb_build_array(
        -- Trazo serpenteante este-oeste (Carlos inspeccionar parcela norte)
        jsonb_build_array(-78.47100, -0.06900),
        jsonb_build_array(-78.46950, -0.06895),
        jsonb_build_array(-78.46750, -0.06905),
        jsonb_build_array(-78.46600, -0.06920),
        jsonb_build_array(-78.46750, -0.06950),
        jsonb_build_array(-78.46950, -0.06960),
        jsonb_build_array(-78.47100, -0.06975),
        jsonb_build_array(-78.47200, -0.06990),
        jsonb_build_array(-78.47100, -0.07020),
        jsonb_build_array(-78.46850, -0.07040),
        jsonb_build_array(-78.46700, -0.07025),
        jsonb_build_array(-78.47100, -0.06900)
      ) as route_points

    union all

    select
      '22222222-2222-2222-2222-222222222222'::uuid,
      'demo.lucia@preview.local'::text,
      0.32::double precision,
      jsonb_build_array(
        -- Trazo zigzag norte-sur (Lucia inspeccionar parcela central)
        jsonb_build_array(-78.46850, -0.07200),
        jsonb_build_array(-78.46900, -0.07050),
        jsonb_build_array(-78.46950, -0.06920),
        jsonb_build_array(-78.46900, -0.06800),
        jsonb_build_array(-78.46800, -0.06900),
        jsonb_build_array(-78.46750, -0.07050),
        jsonb_build_array(-78.46850, -0.07150),
        jsonb_build_array(-78.46950, -0.07100),
        jsonb_build_array(-78.47000, -0.06950),
        jsonb_build_array(-78.46900, -0.06850),
        jsonb_build_array(-78.46800, -0.06950),
        jsonb_build_array(-78.46850, -0.07200)
      )

    union all

    select
      '33333333-3333-3333-3333-333333333333'::uuid,
      'demo.jorge@preview.local'::text,
      0.28::double precision,
      jsonb_build_array(
        -- Trazo diagonal con bucles (Jorge inspeccionar parcela sur)
        jsonb_build_array(-78.46500, -0.07300),
        jsonb_build_array(-78.46650, -0.07200),
        jsonb_build_array(-78.46800, -0.07150),
        jsonb_build_array(-78.46950, -0.07100),
        jsonb_build_array(-78.47050, -0.07050),
        jsonb_build_array(-78.46950, -0.07000),
        jsonb_build_array(-78.46800, -0.07080),
        jsonb_build_array(-78.46650, -0.07150),
        jsonb_build_array(-78.46550, -0.07250),
        jsonb_build_array(-78.46650, -0.07300),
        jsonb_build_array(-78.46800, -0.07250),
        jsonb_build_array(-78.46500, -0.07300)
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