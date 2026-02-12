-- 20260208000289_preview_prereq__geojson_to_multipolygon_4326.sql
-- PREREQ canónico para desbloquear GRANTs/RLS que referencian _geojson_to_multipolygon_4326 en 00300
-- Requiere PostGIS (habilitado en 000100_preview_extensions.sql).
-- Idempotente y bootstrap-safe.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Convierte un GeoJSON (Feature o Geometry) en MULTIPOLYGON SRID 4326.
-- Acepta Polygon/MultiPolygon; si llega GeometryCollection intenta extraer polígonos.
-- Retorna NULL si no se puede convertir.
CREATE OR REPLACE FUNCTION public._geojson_to_multipolygon_4326(p_geojson jsonb)
RETURNS geometry
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_geom_json jsonb;
  v_geom geometry;
  v_type text;
BEGIN
  IF p_geojson IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si viene como Feature, tomar feature.geometry; si no, asumir que es Geometry.
  IF jsonb_typeof(p_geojson) = 'object'
     AND (p_geojson ? 'type')
     AND p_geojson->>'type' = 'Feature' THEN
    v_geom_json := p_geojson->'geometry';
  ELSE
    v_geom_json := p_geojson;
  END IF;

  IF v_geom_json IS NULL THEN
    RETURN NULL;
  END IF;

  -- Parse GeoJSON -> geometry
  BEGIN
    v_geom := ST_GeomFromGeoJSON(v_geom_json::text);
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  IF v_geom IS NULL THEN
    RETURN NULL;
  END IF;

  -- Normalizar SRID a 4326 (si viene 0, asumir 4326; si viene otro, transformar)
  IF ST_SRID(v_geom) IS NULL OR ST_SRID(v_geom) = 0 THEN
    v_geom := ST_SetSRID(v_geom, 4326);
  ELSIF ST_SRID(v_geom) <> 4326 THEN
    BEGIN
      v_geom := ST_Transform(v_geom, 4326);
    EXCEPTION WHEN others THEN
      -- si no se puede transformar (falta info), al menos setear 4326
      v_geom := ST_SetSRID(v_geom, 4326);
    END;
  END IF;

  v_type := GeometryType(v_geom); -- e.g. 'POLYGON', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'

  -- Asegurar MULTIPOLYGON
  IF v_type = 'POLYGON' THEN
    v_geom := ST_Multi(v_geom);
  ELSIF v_type = 'MULTIPOLYGON' THEN
    -- ok
    NULL;
  ELSIF v_type = 'GEOMETRYCOLLECTION' THEN
    -- intentar extraer polígonos y convertir a multi
    v_geom := ST_CollectionExtract(v_geom, 3); -- 3 = polygons
    IF v_geom IS NULL OR ST_IsEmpty(v_geom) THEN
      RETURN NULL;
    END IF;
    v_geom := ST_Multi(v_geom);
  ELSE
    -- otros tipos no sirven para multipolygon
    RETURN NULL;
  END IF;

  -- Validar/repair suave
  IF NOT ST_IsValid(v_geom) THEN
    v_geom := ST_MakeValid(v_geom);
    IF v_geom IS NULL OR ST_IsEmpty(v_geom) THEN
      RETURN NULL;
    END IF;

    -- MakeValid puede devolver GeometryCollection; re-extraer polygons
    IF GeometryType(v_geom) = 'GEOMETRYCOLLECTION' THEN
      v_geom := ST_CollectionExtract(v_geom, 3);
      IF v_geom IS NULL OR ST_IsEmpty(v_geom) THEN
        RETURN NULL;
      END IF;
    END IF;

    v_geom := ST_Multi(v_geom);
  END IF;

  RETURN v_geom;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._geojson_to_multipolygon_4326(jsonb) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
