-- 20260208000388_preview_prereq__drop_conflicting_helpers.sql
-- Drop helpers para evitar: cannot change return type of existing function (42P13)
-- Se ejecuta ANTES de 20260208000400_preview_vft.sql

DROP FUNCTION IF EXISTS public._geojson_extract_radius_m(jsonb);
DROP FUNCTION IF EXISTS public._geojson_extract_geometry(jsonb);
DROP FUNCTION IF EXISTS public._memberships_role_type();

-- (Opcional) si te vuelve a pasar con estas, ya están listas para agregar aquí:
-- DROP FUNCTION IF EXISTS public._geojson_to_multipolygon_4326(jsonb);
-- DROP FUNCTION IF EXISTS public._col_exists(regclass, text);
-- DROP FUNCTION IF EXISTS public._col_exists(text, text);
-- DROP FUNCTION IF EXISTS public._email_norm(text);
