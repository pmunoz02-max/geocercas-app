-- Migration: use an internal representative point for geofence list coordinates
-- Area source of truth: ST_Area(geom::geography)
-- UI reference point source of truth: ST_PointOnSurface(geom)
-- This ensures shown Lat/Lng stays inside irregular or concave geofences.

create or replace function public.list_geofences_with_area_preview(
  p_org_id uuid,
  p_only_active boolean default true
)
returns table(
  id uuid,
  org_id uuid,
  name text,
  description text,
  polygon_geojson jsonb,
  geojson jsonb,
  lat double precision,
  lng double precision,
  centroid_lat double precision,
  centroid_lng double precision,
  radius_m integer,
  active boolean,
  is_default boolean,
  source_geocerca_id uuid,
  bbox double precision[],
  created_at timestamptz,
  updated_at timestamptz,
  area_m2 numeric
)
language sql
stable
as $function$
select
  g.id,
  g.org_id,
  g.name,
  g.description,
  g.polygon_geojson,
  g.geojson,
  g.lat,
  g.lng,
  st_y(st_pointonsurface(g.geom))::double precision as centroid_lat,
  st_x(st_pointonsurface(g.geom))::double precision as centroid_lng,
  g.radius_m,
  g.active,
  g.is_default,
  g.source_geocerca_id,
  g.bbox,
  g.created_at,
  g.updated_at,
  round(
    coalesce(
      st_area(g.geom::geography),
      0
    )::numeric,
    2
  ) as area_m2
from public.geofences g
where g.org_id = p_org_id
  and (
    p_only_active is false
    or g.active = true
  )
order by g.name asc;
$function$;

grant execute on function public.list_geofences_with_area_preview(
  uuid,
  boolean
) to authenticated;