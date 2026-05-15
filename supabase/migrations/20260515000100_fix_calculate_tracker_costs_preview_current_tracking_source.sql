create or replace function public.calculate_tracker_costs_preview(
  p_org_id uuid,
  p_date_from date,
  p_date_to date
)
returns table(
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
language sql
stable
as $function$
with matched_positions as (
  select
    tp.org_id,
    tp.user_id as tracker_user_id,
    a.id as assignment_id,
    a.activity_id,
    a.frequency_minutes,
    tp.recorded_at,
    tp.lat,
    tp.lng,
    (tp.recorded_at at time zone 'utc')::date as work_date
  from public.tracker_positions tp
  join public.asignaciones a
    on a.org_id = tp.org_id
   and coalesce(a.is_deleted, false) = false
   and lower(coalesce(a.status, a.estado, 'active')) in (
     'active',
     'activa',
     'activo',
     'enabled',
     'vigente'
   )
   and (
     a.user_id = tp.user_id
     or exists (
       select 1
       from public.personal pe
       where pe.id = a.personal_id
         and pe.org_id = a.org_id
         and pe.user_id = tp.user_id
     )
   )
   and (a.start_time is null or tp.recorded_at >= a.start_time)
   and (a.end_time is null or tp.recorded_at <= a.end_time)
   and (a.start_date is null or tp.recorded_at::date >= a.start_date)
   and (a.end_date is null or tp.recorded_at::date <= a.end_date)
  where tp.org_id = p_org_id
    and tp.recorded_at::date between p_date_from and p_date_to
    and tp.lat is not null
    and tp.lng is not null
),
ordered_points as (
  select
    mp.*,
    lag(mp.recorded_at) over (
      partition by
        mp.org_id,
        mp.tracker_user_id,
        mp.assignment_id,
        mp.work_date
      order by mp.recorded_at
    ) as prev_recorded_at,
    lag(mp.lat) over (
      partition by
        mp.org_id,
        mp.tracker_user_id,
        mp.assignment_id,
        mp.work_date
      order by mp.recorded_at
    ) as prev_lat,
    lag(mp.lng) over (
      partition by
        mp.org_id,
        mp.tracker_user_id,
        mp.assignment_id,
        mp.work_date
      order by mp.recorded_at
    ) as prev_lng
  from matched_positions mp
),
segments as (
  select
    op.*,
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
            cos(radians(op.prev_lat)) *
            cos(radians(op.lat)) *
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
      coalesce(
        sum(case when c.segment_type = 'valid' then c.distance_m else 0 end),
        0
      )::numeric / 1000,
      3
    ) as km_observados,
    round(
      coalesce(
        sum(case when c.segment_type = 'valid' then c.delta_t_sec else 0 end),
        0
      )::numeric / 3600,
      3
    ) as horas_observadas,
    round(
      coalesce(
        sum(case when c.segment_type = 'gap' then c.delta_t_sec else 0 end),
        0
      )::numeric / 60,
      1
    ) as minutos_sin_cobertura,
    count(*) filter (where c.segment_type = 'gap')::integer as numero_huecos,
    8::numeric as expected_hours
  from classified c
  group by
    c.org_id,
    c.tracker_user_id,
    c.assignment_id,
    c.activity_id,
    c.work_date
)
select
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
  case
    when dm.expected_hours <= 0 then 0::numeric
    else round(dm.horas_observadas / dm.expected_hours, 4)
  end as porcentaje_cobertura,
  case
    when dm.points_count < 2 then 'INSUFICIENTE'
    when dm.horas_observadas / nullif(dm.expected_hours, 0) >= 0.85 then 'ALTO'
    when dm.horas_observadas / nullif(dm.expected_hours, 0) >= 0.60 then 'MEDIO'
    else 'BAJO'
  end as nivel_confianza,
  0::integer as visitas_validas,
  0::numeric as costo_km,
  case
    when dm.points_count < 2 then 0::numeric
    else round(dm.horas_observadas * coalesce(act.hourly_rate, 0), 2)
  end as costo_hora,
  0::numeric as costo_visita,
  case
    when dm.points_count < 2 then 0::numeric
    else round(dm.horas_observadas * coalesce(act.hourly_rate, 0), 2)
  end as costo_total,
  coalesce(act.hourly_rate, 0)::numeric as hourly_rate,
  0::numeric as km_rate,
  coalesce(act.currency_code, 'USD')::text as currency_code
from daily_metrics dm
left join public.activities act
  on act.id = dm.activity_id
 and act.org_id = dm.org_id
order by
  dm.work_date,
  dm.tracker_user_id,
  dm.assignment_id;
$function$;