-- Migration: Crear función public.get_tracker_route_positions_preview
-- Replica exacta de la RPC ya ejecutada en Preview

CREATE OR REPLACE FUNCTION public.get_tracker_route_positions_preview(
  p_org_id uuid,
  p_from_ts timestamptz,
  p_to_ts timestamptz default now()
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  user_id uuid,
  personal_id uuid,
  asignacion_id uuid,
  lat double precision,
  lng double precision,
  accuracy double precision,
  speed double precision,
  heading double precision,
  battery integer,
  is_mock boolean,
  source text,
  recorded_at timestamptz,
  created_at timestamptz,
  assignment_id uuid,
  geofence_id uuid
) AS $$
WITH candidate_route_positions AS (
  SELECT
    tp.id,
    tp.org_id,
    tp.user_id,
    tp.personal_id,
    tp.asignacion_id,
    tp.lat,
    tp.lng,
    tp.accuracy,
    tp.speed,
    tp.heading,
    tp.battery,
    tp.is_mock,
    tp.source,
    tp.recorded_at,
    tp.created_at,
    a.id AS assignment_id,
    assigned_geofence_inside.id AS geofence_id,
    ROW_NUMBER() OVER (
      PARTITION BY tp.id
      ORDER BY
        CASE
          WHEN assigned_geofence_inside.id = a.geofence_id THEN 0
          ELSE 1
        END,
        a.start_time DESC NULLS LAST,
        a.start_date DESC NULLS LAST,
        a.id
    ) AS match_rank
  FROM public.tracker_positions tp
  JOIN public.asignaciones a
    ON a.org_id = tp.org_id
   AND COALESCE(a.is_deleted, FALSE) = FALSE
   AND LOWER(COALESCE(a.status, a.estado, 'active')) IN (
     'active',
     'activa',
     'activo',
     'enabled',
     'vigente'
   )
   AND (
     a.user_id = tp.user_id
     OR EXISTS (
       SELECT 1
       FROM public.personal pe
       WHERE pe.id = a.personal_id
         AND pe.org_id = a.org_id
         AND pe.user_id = tp.user_id
     )
   )
   AND (a.start_time IS NULL OR tp.recorded_at >= a.start_time)
   AND (a.end_time IS NULL OR tp.recorded_at <= a.end_time)
   AND (a.start_date IS NULL OR tp.recorded_at::date >= a.start_date)
   AND (a.end_date IS NULL OR tp.recorded_at::date <= a.end_date)
  JOIN LATERAL (
    SELECT g.id
    FROM public.geofences g
    WHERE g.org_id = a.org_id
      AND g.geom IS NOT NULL
      AND (
        g.id = a.geofence_id
        OR g.source_geocerca_id = a.geocerca_id
      )
      AND ST_COVERS(
        g.geom,
        ST_SETSRID(ST_POINT(tp.lng, tp.lat), 4326)
      )
    ORDER BY
      CASE WHEN g.id = a.geofence_id THEN 0 ELSE 1 END,
      g.created_at DESC
    LIMIT 1
  ) assigned_geofence_inside ON TRUE
  WHERE tp.org_id = p_org_id
    AND tp.recorded_at >= p_from_ts
    AND tp.recorded_at <= COALESCE(p_to_ts, now())
    AND tp.lat IS NOT NULL
    AND tp.lng IS NOT NULL
)
SELECT
  crp.id,
  crp.org_id,
  crp.user_id,
  crp.personal_id,
  crp.asignacion_id,
  crp.lat,
  crp.lng,
  crp.accuracy,
  crp.speed,
  crp.heading,
  crp.battery,
  crp.is_mock,
  crp.source,
  crp.recorded_at,
  crp.created_at,
  crp.assignment_id,
  crp.geofence_id
FROM candidate_route_positions crp
WHERE crp.match_rank = 1
ORDER BY
  crp.recorded_at ASC,
  crp.created_at ASC,
  crp.id ASC;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION public.get_tracker_route_positions_preview(uuid, timestamptz, timestamptz) TO authenticated;
