CREATE OR REPLACE FUNCTION public.calculate_tracker_costs_preview(
  p_org_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE(
  org_id uuid,
  tracker_user_id uuid,
  assignment_id uuid,
  activity_id uuid,
  work_date date,
  points_count integer,
  km_observados numeric,
  horas_observadas numeric,
  minutos_sin_cobertura numeric,
  numero_huecos integer,
  expected_hours numeric,
  porcentaje_cobertura numeric,
  nivel_confianza text,
  visitas_validas integer,
  costo_km numeric,
  costo_hora numeric,
  costo_visita numeric,
  costo_total numeric,
  hourly_rate numeric,
  km_rate numeric,
  currency_code text
)
LANGUAGE sql
STABLE
AS $function$

with matched_positions as (
  select
    p.org_id,
    p.user_id as tracker_user_id,
    ta.id as assignment_id,
    ta.activity_id,
    ta.frequency_minutes,
    p.recorded_at,
    p.lat,
    p.lng,
    p.accuracy,
    (p.recorded_at at time zone 'utc')::date as work_date
  from public.positions p
  join public.tracker_assignments ta
    on ta.tracker_user_id = p.user_id
   and ta.org_id = p.org_id
   and p.recorded_at::date between ta.start_date and ta.end_date
  where p.org_id = p_org_id
    and p.recorded_at::date between p_date_from and p_date_to
),

ordered_points as (
  select
    mp.*,
    lag(mp.recorded_at) over (
      partition by mp.org_id, mp.tracker_user_id, mp.assignment_id, mp.work_date
      order by mp.recorded_at
    ) as prev_recorded_at,
    lag(mp.lat) over (
      partition by mp.org_id, mp.tracker_user_id, mp.assignment_id, mp.work_date
      order by mp.recorded_at
    ) as prev_lat,
    lag(mp.lng) over (
      partition by mp.org_id, mp.tracker_user_id, mp.assignment_id, mp.work_date
      order by mp.recorded_at
    ) as prev_lng
  from matched_positions mp
),

segments as (
  select
    op.org_id,
    op.tracker_user_id,
    op.assignment_id,
    op.activity_id,
    op.frequency_minutes,
    op.work_date,
    op.recorded_at,
    op.prev_recorded_at,
    op.lat,
    op.lng,
    op.prev_lat,
    op.prev_lng,
    case
      when op.prev_recorded_at is null then null
      else extract(epoch from (op.recorded_at - op.prev_recorded_at))
    end as delta_t_sec,
    case
      when op.prev_recorded_at is null
        or op.prev_lat is null
        or op.prev_lng is null
      then null
      else (
        6371000::numeric * 2 * asin(
          sqrt(
            power(sin(radians((op.lat - op.prev_lat) / 2)), 2) +
            cos(radians(op.prev_lat)) * cos(radians(op.lat)) *
            power(sin(radians((op.lng - op.prev_lng) / 2)), 2)
          )
        )
      )
    end as distance_m,
    greatest(600, coalesce(op.frequency_minutes, 5) * 3 * 60) as gap_threshold_sec
  from ordered_points op
),

classified as (
  select
    s.*,
    case
      when s.delta_t_sec is null then 'first_point'
      when s.delta_t_sec <= s.gap_threshold_sec then 'valid'
      else 'gap'
    end as segment_type
  from segments s
),

daily_metrics as (
  select
    c.org_id,
    c.tracker_user_id,
    c.assignment_id,
    c.activity_id,
    c.work_date,

    count(*)::integer as points_count,

    round(
      coalesce(sum(case when c.segment_type = 'valid' then c.distance_m else 0 end), 0)::numeric / 1000,
      3
    ) as km_observados,

    round(
      coalesce(sum(case when c.segment_type = 'valid' then c.delta_t_sec else 0 end), 0)::numeric / 3600,
      3
    ) as horas_observadas,

    round(
      coalesce(sum(case when c.segment_type = 'gap' then c.delta_t_sec else 0 end), 0)::numeric / 60,
      1
    ) as minutos_sin_cobertura,

    count(*) filter (where c.segment_type = 'gap')::integer as numero_huecos,

    extract(epoch from (ta.end_time - ta.start_time)) / 3600 as expected_hours

  from classified c
  join public.tracker_assignments ta
    on ta.id = c.assignment_id and ta.org_id = c.org_id
  group by
    c.org_id,
    c.tracker_user_id,
    c.assignment_id,
    c.activity_id,
    c.work_date,
    ta.start_time,
    ta.end_time
)


SELECT
  dm.org_id,
  dm.tracker_user_id,
  dm.assignment_id,
  dm.activity_id,
  dm.work_date,
  dm.points_count,
  dm.km_observados,
  dm.horas_observadas,
  dm.minutos_sin_cobertura,
  dm.numero_huecos,
  dm.expected_hours,

  CASE
    WHEN dm.expected_hours <= 0 THEN 0::numeric
    ELSE round(dm.horas_observadas / dm.expected_hours, 4)
  END AS porcentaje_cobertura,

  CASE
    WHEN dm.points_count < 2 THEN 'INSUFICIENTE'
    WHEN (CASE WHEN dm.expected_hours <= 0 THEN 0::numeric ELSE round(dm.horas_observadas / dm.expected_hours, 4) END) >= 0.85 THEN 'ALTO'
    WHEN (CASE WHEN dm.expected_hours <= 0 THEN 0::numeric ELSE round(dm.horas_observadas / dm.expected_hours, 4) END) >= 0.60 THEN 'MEDIO'
    ELSE 'BAJO'
  END AS nivel_confianza,

  0::integer as visitas_validas,

  CASE
    WHEN dm.points_count < 2 THEN 0::numeric
    ELSE round(dm.km_observados * coalesce(act.km_rate, 0), 2)
  END AS costo_km,

  CASE
    WHEN dm.points_count < 2 THEN 0::numeric
    ELSE round(dm.horas_observadas * coalesce(act.hourly_rate, 0), 2)
  END AS costo_hora,

  0::numeric(12,2) as costo_visita,

  CASE
    WHEN dm.points_count < 2 THEN 0::numeric
    ELSE round(
      (dm.km_observados * coalesce(act.km_rate, 0)) +
      (dm.horas_observadas * coalesce(act.hourly_rate, 0)),
      2
    )
  END AS costo_total,
  act.hourly_rate,
  act.km_rate,
  act.currency_code
FROM daily_metrics dm
LEFT JOIN public.activities act ON act.id = dm.activity_id AND act.org_id = dm.org_id
ORDER BY dm.work_date, dm.tracker_user_id, dm.assignment_id;

$function$;