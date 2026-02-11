-- 20260208000287_preview_prereq__geojson_extract_geometry.sql
-- PREREQ canónico para desbloquear GRANTs/RLS que referencian _geojson_extract_geometry en 00300
-- Requiere PostGIS (ya lo habilitas en 000100_preview_extensions.sql).
-- Idempotente y bootstrap-safe.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Extrae el objeto Geometry de un GeoJSON (Feature o Geometry) y lo retorna como geometry (PostGIS)
-- Retorna NULL si el input es NULL, o si no se puede parsear.
DROP FUNCTION IF EXISTS public._geojson_extract_geometry(jsonb);

CREATE FUNCTION public._geojson_extract_geometry(p_geojson jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
declare
  v_type text;
  v_geom jsonb;
begin
  if p_geojson is null then
    raise exception 'geojson is required';
  end if;

  v_type := lower(coalesce(p_geojson->>'type',''));

  if v_type = 'featurecollection' then
    v_geom := p_geojson #> '{features,0,geometry}';
  elsif v_type = 'feature' then
    v_geom := p_geojson -> 'geometry';
  else
    v_geom := p_geojson;
  end if;

  if v_geom is null then
    raise exception 'Invalid GeoJSON: missing geometry';
  end if;

  return v_geom;
end;
$$;

RETURNS geometry
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_geom jsonb;
  v_text text;
BEGIN
  IF p_geojson IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si viene como Feature, tomar feature.geometry; si no, asumir que es Geometry.
  IF jsonb_typeof(p_geojson) = 'object' AND (p_geojson ? 'type') AND p_geojson->>'type' = 'Feature' THEN
    v_geom := p_geojson->'geometry';
  ELSE
    v_geom := p_geojson;
  END IF;

  IF v_geom IS NULL THEN
    RETURN NULL;
  END IF;

  v_text := v_geom::text;

  -- ST_GeomFromGeoJSON acepta texto JSON de geometry.
  -- Si está mal formado, atrapamos error y devolvemos NULL.
  BEGIN
    RETURN ST_GeomFromGeoJSON(v_text);
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._geojson_extract_geometry(jsonb) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
