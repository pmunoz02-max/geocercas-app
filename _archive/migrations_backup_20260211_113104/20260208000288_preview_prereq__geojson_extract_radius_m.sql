-- 20260208000288_preview_prereq__geojson_extract_radius_m.sql
-- PREREQ canónico para desbloquear GRANTs/RLS que referencian _geojson_extract_radius_m en 00300
-- Idempotente y bootstrap-safe.

BEGIN;

CREATE SCHEMA IF NOT EXISTS public;

-- Extrae el radio (en metros) desde un GeoJSON.
-- Soporta Feature con properties.radius_m / radius / radiusMeters, etc.
-- Retorna NULL si no existe o no es convertible a número.
CREATE OR REPLACE FUNCTION public._geojson_extract_radius_m(p_geojson jsonb)
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_props jsonb;
  v_val  jsonb;
  v_txt  text;
BEGIN
  IF p_geojson IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si es Feature, usar properties; si no, intentar usar el objeto raíz
  IF jsonb_typeof(p_geojson) = 'object'
     AND (p_geojson ? 'type')
     AND p_geojson->>'type' = 'Feature' THEN
    v_props := p_geojson->'properties';
  ELSE
    v_props := p_geojson->'properties';
  END IF;

  IF v_props IS NULL OR jsonb_typeof(v_props) <> 'object' THEN
    -- fallback: buscar claves en el objeto raíz por si viene "plano"
    v_props := p_geojson;
  END IF;

  -- Prioridad de claves típicas
  IF v_props ? 'radius_m' THEN
    v_val := v_props->'radius_m';
  ELSIF v_props ? 'radiusMeters' THEN
    v_val := v_props->'radiusMeters';
  ELSIF v_props ? 'radius' THEN
    v_val := v_props->'radius';
  ELSIF v_props ? 'r_m' THEN
    v_val := v_props->'r_m';
  ELSE
    RETURN NULL;
  END IF;

  IF v_val IS NULL THEN
    RETURN NULL;
  END IF;

  -- Convertir a número (acepta json number o string numérica)
  IF jsonb_typeof(v_val) = 'number' THEN
    RETURN (v_val::text)::double precision;
  ELSIF jsonb_typeof(v_val) = 'string' THEN
    v_txt := btrim(v_val::text, '"'); -- quita comillas JSON
    IF v_txt = '' THEN
      RETURN NULL;
    END IF;

    BEGIN
      RETURN v_txt::double precision;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

-- Permisos mínimos para evitar crash en 00300
DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._geojson_extract_radius_m(jsonb) TO anon, authenticated';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

COMMIT;
