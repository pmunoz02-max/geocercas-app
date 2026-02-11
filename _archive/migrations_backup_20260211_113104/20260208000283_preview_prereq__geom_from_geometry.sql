-- 20260208000283_preview_prereq__geom_from_geometry.sql
-- PREREQ canónico para desbloquear GRANTs/RLS que referencian _geom_from_geometry en 00300
-- Requiere PostGIS (ya habilitado en 000100_preview_extensions.sql).
-- Idempotente y bootstrap-safe.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Convierte un JSONB de "geometry" (GeoJSON Geometry o Feature) a geometry PostGIS.
-- Retorna NULL si no se puede parsear.
CREATE OR REPLACE FUNCTION public._geom_from_geometry(_geom_json jsonb)
RETURNS geometry
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_geom_json jsonb;
BEGIN
  IF _geom_json IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si viene como Feature, tomar feature.geometry; si no, asumir Geometry.
  IF jsonb_typeof(_geom_json) = 'object'
     AND (_geom_json ? 'type')
     AND _geom_json->>'type' = 'Feature' THEN
    v_geom_json := _geom_json->'geometry';
  ELSE
    v_geom_json := _geom_json;
  END IF;

  IF v_geom_json IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN ST_GeomFromGeoJSON(v_geom_json::text);
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._geom_from_geometry(jsonb) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
