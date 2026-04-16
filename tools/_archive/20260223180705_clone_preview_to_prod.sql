

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "cube" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "earthdistance" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'owner',
    'admin',
    'tracker'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."assign_result" AS (
	"status" "text",
	"message" "text"
);


ALTER TYPE "public"."assign_result" OWNER TO "postgres";


CREATE TYPE "public"."attendance_kind" AS ENUM (
    'check_in',
    'check_out'
);


ALTER TYPE "public"."attendance_kind" OWNER TO "postgres";


CREATE TYPE "public"."invite_status" AS ENUM (
    'pending',
    'accepted',
    'cancelled',
    'expired'
);


ALTER TYPE "public"."invite_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_code" AS ENUM (
    'starter',
    'pro',
    'enterprise',
    'free',
    'elite',
    'elite_plus'
);


ALTER TYPE "public"."plan_code" OWNER TO "postgres";


CREATE TYPE "public"."role_type" AS ENUM (
    'owner',
    'admin',
    'tracker',
    'viewer'
);


ALTER TYPE "public"."role_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_app_user_roles_delete"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  if p_user_id is null or p_org_id is null then
    return;
  end if;

  delete from public.app_user_roles
  where user_id = p_user_id and org_id = p_org_id;
end;
$$;


ALTER FUNCTION "public"."_app_user_roles_delete"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_app_user_roles_upsert"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  r text;
begin
  if p_user_id is null or p_org_id is null then
    return;
  end if;

  r := public._normalize_app_role(p_role);

  insert into public.app_user_roles (user_id, org_id, role)
  values (p_user_id, p_org_id, r)
  on conflict (user_id, org_id)
  do update set role = excluded.role;
end;
$$;


ALTER FUNCTION "public"."_app_user_roles_upsert"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_col_exists"("p_table" "regclass", "p_col" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from pg_attribute a
    where a.attrelid = p_table
      and a.attname  = p_col
      and a.attnum > 0
      and not a.attisdropped
  );
$$;


ALTER FUNCTION "public"."_col_exists"("p_table" "regclass", "p_col" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_col_exists"("p_table" "text", "p_col" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_reg regclass;
begin
  begin
    v_reg := p_table::regclass;
  exception when others then
    return false;
  end;

  return public._col_exists(v_reg, p_col);
end;
$$;


ALTER FUNCTION "public"."_col_exists"("p_table" "text", "p_col" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_email_norm"("p_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v text;
BEGIN
  IF p_email IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(p_email));

  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- Si quieres además limpiar espacios internos (poco común en emails),
  -- descomenta:
  -- v := regexp_replace(v, '\s+', '', 'g');

  RETURN v;
END;
$$;


ALTER FUNCTION "public"."_email_norm"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_geojson_to_multipolygon_4326"("p_geojson" "jsonb") RETURNS "public"."geometry"
    LANGUAGE "plpgsql" IMMUTABLE
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


ALTER FUNCTION "public"."_geojson_to_multipolygon_4326"("p_geojson" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_geom_from_geometry"("_geom_json" "jsonb") RETURNS "public"."geometry"
    LANGUAGE "plpgsql" IMMUTABLE
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


ALTER FUNCTION "public"."_geom_from_geometry"("_geom_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select
    exists (
      select 1 from public.memberships m
      where m.user_id = p_user_id and m.org_id = p_org_id
    )
    or
    exists (
      select 1 from public.org_members om
      where om.user_id = p_user_id and om.org_id = p_org_id
    );
$$;


ALTER FUNCTION "public"."_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_is_root_claim"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select true
$$;


ALTER FUNCTION "public"."_is_root_claim"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_normalize_app_role"("p_role" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  r text;
begin
  r := lower(trim(coalesce(p_role, '')));
  if r = '' then
    return 'tracker';
  end if;

  -- owner lo tratamos como admin en app_user_roles
  if r = 'owner' then
    return 'admin';
  end if;

  return r;
end;
$$;


ALTER FUNCTION "public"."_normalize_app_role"("p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_normalize_role_for_app_user_roles"("p_user" "uuid", "p_org" "uuid", "p_role" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v text;
BEGIN
  IF p_role IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(p_role));
  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- Canonical roles del core (ajusta en 00400 si tu canonical set difiere)
  IF v IN ('owner', 'admin', 'tracker', 'viewer') THEN
    RETURN v;
  END IF;

  -- Algunas variantes comunes (bootstrap-friendly)
  IF v IN ('superadmin', 'super_admin') THEN
    RETURN 'admin';
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."_normalize_role_for_app_user_roles"("p_user" "uuid", "p_org" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_org_members_user_col"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT 'user_id'::text;
$$;


ALTER FUNCTION "public"."_org_members_user_col"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_org_parent_table_of_org_members"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT 'memberships'::text;
$$;


ALTER FUNCTION "public"."_org_parent_table_of_org_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_organizations_plan_default_label"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT 'free'::text;
$$;


ALTER FUNCTION "public"."_organizations_plan_default_label"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_organizations_plan_type"() RETURNS "regtype"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT 'text'::regtype;
$$;


ALTER FUNCTION "public"."_organizations_plan_type"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pick_membership_role_label"("p_desired" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v text;
BEGIN
  IF p_desired IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(p_desired));
  IF v = '' THEN
    RETURN NULL;
  END IF;

  IF v IN ('owner', 'admin', 'tracker', 'viewer') THEN
    RETURN v;
  END IF;

  -- variantes comunes
  IF v IN ('superadmin', 'super_admin') THEN
    RETURN 'admin';
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."_pick_membership_role_label"("p_desired" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pick_org_table"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT 'organizations'::text;
$$;


ALTER FUNCTION "public"."_pick_org_table"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_resolve_tenant_for_current_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_org uuid;
BEGIN
  -- Bootstrap-safe: no asumir memberships listas, no lanzar exception.
  BEGIN
    SELECT m.org_id
      INTO v_org
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
    ORDER BY m.created_at NULLS LAST
    LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    RETURN NULL;
  WHEN others THEN
    RETURN NULL;
  END;

  RETURN v_org;
END;
$$;


ALTER FUNCTION "public"."_resolve_tenant_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_trg_sync_app_user_roles"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_org_id  := old.org_id;
    perform public._app_user_roles_delete(v_user_id, v_org_id);
    return old;
  else
    v_user_id := new.user_id;
    v_org_id  := new.org_id;

    -- role puede no existir en algunas tablas (pero en las que usaremos sí).
    begin
      v_role := new.role;
    exception when undefined_column then
      v_role := 'tracker';
    end;

    perform public._app_user_roles_upsert(v_user_id, v_org_id, v_role);
    return new;
  end if;
end;
$$;


ALTER FUNCTION "public"."_trg_sync_app_user_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_user_has_org"("p_user" "uuid", "p_org" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_user IS NULL OR p_org IS NULL THEN
    RETURN FALSE;
  END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = p_user
        AND m.org_id  = p_org
    )
    INTO v_exists;
  EXCEPTION WHEN undefined_table THEN
    RETURN FALSE;
  WHEN others THEN
    RETURN FALSE;
  END;

  RETURN COALESCE(v_exists, FALSE);
END;
$$;


ALTER FUNCTION "public"."_user_has_org"("p_user" "uuid", "p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activities_create"("p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_active" boolean DEFAULT true, "p_currency_code" "text" DEFAULT 'USD'::"text", "p_hourly_rate" numeric DEFAULT NULL::numeric) RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "org_id" "uuid", "name" "text", "description" "text", "active" boolean, "currency_code" "text", "hourly_rate" numeric, "created_at" timestamp with time zone, "created_by" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe: retorna 0 filas pero compila con la firma exacta
  return;
end;
$$;


ALTER FUNCTION "public"."activities_create"("p_name" "text", "p_description" "text", "p_active" boolean, "p_currency_code" "text", "p_hourly_rate" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activities_create"("p_name" "text", "p_description" "text", "p_active" boolean, "p_currency_code" "text", "p_hourly_rate" numeric) IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."activities_delete"("p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe
  return false;
end;
$$;


ALTER FUNCTION "public"."activities_delete"("p_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activities_delete"("p_id" "uuid") IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."activities_set_active"("p_id" "uuid", "p_active" boolean) RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "org_id" "uuid", "name" "text", "description" "text", "active" boolean, "currency_code" "text", "hourly_rate" numeric, "created_at" timestamp with time zone, "created_by" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe: retorna 0 filas
  return;
end;
$$;


ALTER FUNCTION "public"."activities_set_active"("p_id" "uuid", "p_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activities_set_active"("p_id" "uuid", "p_active" boolean) IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."activities_sync_org_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- bootstrap-safe: no tocamos nada, solo retornamos NEW si existe
  return new;
end;
$$;


ALTER FUNCTION "public"."activities_sync_org_tenant"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activities_sync_org_tenant"() IS 'PREREQ bootstrap-safe. Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."activities_update"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_currency_code" "text", "p_hourly_rate" numeric) RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "org_id" "uuid", "name" "text", "description" "text", "active" boolean, "currency_code" "text", "hourly_rate" numeric, "created_at" timestamp with time zone, "created_by" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe: retorna 0 filas
  return;
end;
$$;


ALTER FUNCTION "public"."activities_update"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_currency_code" "text", "p_hourly_rate" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."activities_update"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_currency_code" "text", "p_hourly_rate" numeric) IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."admin_assign_or_create_org"("p_email" "text", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe
  return null;
end;
$$;


ALTER FUNCTION "public"."admin_assign_or_create_org"("p_email" "text", "p_role" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_assign_or_create_org"("p_email" "text", "p_role" "text") IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."admin_assign_role_org"("p_email" "text", "p_role_slug" "text", "p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe
  return;
end;
$$;


ALTER FUNCTION "public"."admin_assign_role_org"("p_email" "text", "p_role_slug" "text", "p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_assign_role_org"("p_email" "text", "p_role_slug" "text", "p_org_id" "uuid") IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."admin_assign_role_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe
  return;
end;
$$;


ALTER FUNCTION "public"."admin_assign_role_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_assign_role_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."app_admin_mode"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe
  return false;
end;
$$;


ALTER FUNCTION "public"."app_admin_mode"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_admin_mode"() IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."app_current_tenant_id"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro: sin tenant definido aún
  return null;
end;
$$;


ALTER FUNCTION "public"."app_current_tenant_id"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_current_tenant_id"("p_user_id" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."app_install_rls"("p_table" "regclass", "p_org_col" "text", "p_owner_col" "text", "p_require_owner_write" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op (en bootstrap no instalamos nada)
  return;
end;
$$;


ALTER FUNCTION "public"."app_install_rls"("p_table" "regclass", "p_org_col" "text", "p_owner_col" "text", "p_require_owner_write" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_install_rls"("p_table" "regclass", "p_org_col" "text", "p_owner_col" "text", "p_require_owner_write" boolean) IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."app_is_admin"("p_org" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return false;
end;
$$;


ALTER FUNCTION "public"."app_is_admin"("p_org" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_is_admin"("p_org" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."app_is_member"("p_org" "uuid", "p_roles" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return false;
end;
$$;


ALTER FUNCTION "public"."app_is_member"("p_org" "uuid", "p_roles" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_is_member"("p_org" "uuid", "p_roles" "text"[]) IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."app_jwt_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select 'owner'::text
$$;


ALTER FUNCTION "public"."app_jwt_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_jwt_tenant"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select null::uuid
$$;


ALTER FUNCTION "public"."app_jwt_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_set_tenant"("p_tenant" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."app_set_tenant"("p_tenant" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_set_tenant"("p_tenant" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."audit_memberships"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."audit_memberships"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."audit_memberships"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."audit_organizations"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."audit_organizations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."audit_organizations"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."bootstrap_session_context"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."bootstrap_session_context"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bootstrap_session_context"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."bootstrap_tracker_assignment_current_user"("p_frequency_minutes" integer, "p_days" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."bootstrap_tracker_assignment_current_user"("p_frequency_minutes" integer, "p_days" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bootstrap_tracker_assignment_current_user"("p_frequency_minutes" integer, "p_days" integer) IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."bootstrap_user_after_login"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_org_id  uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'bootstrap_user_after_login: auth.uid() es NULL';
  end if;

  -- Usa tu función existente (ya es SECURITY DEFINER)
  v_org_id := public.ensure_org_for_current_user();

  return v_org_id;
end;
$$;


ALTER FUNCTION "public"."bootstrap_user_after_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_user_context"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $_$
declare
  v_uid uuid;
  v_email text;
  v_org_id uuid;
  v_role role_type;

  v_plan_udt text;
  v_plan_value text;

  v_org_name text;
  v_has_active boolean;

  v_pos_interval int;
  v_pos_default_expr text;

  v_role_text text;
  v_role_legacy text;

  v_personal_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'No auth.uid() in request';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null then
    v_email := current_setting('request.jwt.claim.email', true);
  end if;

  if v_email is null then
    v_email := 'user-' || v_uid::text;
  end if;

  v_org_name := split_part(v_email, '@', 1);

  -- Enum de organizations.plan (primer valor)
  select c.udt_name
    into v_plan_udt
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name='organizations'
    and c.column_name='plan'
  limit 1;

  if v_plan_udt is null then
    raise exception 'organizations.plan type not found';
  end if;

  select e.enumlabel
    into v_plan_value
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  where t.typname = v_plan_udt
  order by e.enumsortorder
  limit 1;

  if v_plan_value is null then
    raise exception 'organizations.plan enum has no values';
  end if;

  -- ¿Tiene memberships activas?
  select exists (
    select 1
    from public.memberships m
    where m.user_id = v_uid
      and m.revoked_at is null
  ) into v_has_active;

  if not v_has_active then
    execute format($f$
      insert into public.organizations
        (id, name, owner_id, plan, created_at, updated_at, created_by, active, suspended, is_personal)
      values
        (extensions.gen_random_uuid(), %L, %L, %L::%I, now(), now(), %L, true, false, true)
      returning id
    $f$,
      v_org_name,
      v_uid,
      v_plan_value,
      v_plan_udt,
      v_uid
    )
    into v_org_id;

    insert into public.memberships (org_id, user_id, role, is_default, revoked_at, created_at)
    values (v_org_id, v_uid, 'owner'::role_type, true, null, now())
    on conflict (org_id, user_id)
    do update set
      role = excluded.role,
      is_default = true,
      revoked_at = null;
  end if;

  -- Resolver default org
  select m.org_id, m.role
    into v_org_id, v_role
  from public.memberships m
  where m.user_id = v_uid
    and m.revoked_at is null
    and m.is_default = true
  order by m.created_at nulls last
  limit 1;

  if v_org_id is null then
    select m.org_id, m.role
      into v_org_id, v_role
    from public.memberships m
    where m.user_id = v_uid
      and m.revoked_at is null
    order by m.created_at nulls last
    limit 1;

    if v_org_id is null then
      raise exception 'No active membership after bootstrap for user %', v_uid;
    end if;

    update public.memberships
    set is_default = false
    where user_id = v_uid;

    update public.memberships
    set is_default = true
    where user_id = v_uid
      and org_id = v_org_id;
  end if;

  select m.role
    into v_role
  from public.memberships m
  where m.user_id = v_uid
    and m.org_id = v_org_id
    and m.revoked_at is null
  limit 1;

  if v_role is null then
    raise exception 'Could not resolve role for user % in org %', v_uid, v_org_id;
  end if;

  -- role mappings
  v_role_text := v_role::text;
  v_role_legacy := case v_role_text
    when 'owner' then 'Owner'
    when 'admin' then 'Admin'
    when 'tracker' then 'Tracker'
    when 'viewer' then 'Viewer'
    else initcap(v_role_text)
  end;

  -- DEFAULT real de position_interval_sec (si existe)
  select pg_get_expr(d.adbin, d.adrelid)
    into v_pos_default_expr
  from pg_attrdef d
  join pg_class c on c.oid = d.adrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
  where n.nspname='public'
    and c.relname='personal'
    and a.attname='position_interval_sec'
  limit 1;

  if v_pos_default_expr is not null then
    begin
      v_pos_interval := v_pos_default_expr::int;
    exception when others then
      v_pos_interval := null;
    end;
  end if;

  if v_pos_interval is null then
    v_pos_interval := 300;
  end if;

  -- ✅ Sync legacy: si existían rows antiguas owner_id=user y user_id null, se corrige
  update public.personal
  set user_id = v_uid
  where owner_id = v_uid
    and user_id is null
    and is_deleted = false;

  -- ✅ UPSERT CANÓNICO: 1 fila por (user_id, org_id)
  insert into public.personal (
    id, nombre, email, owner_id, user_id, org_id,
    created_at, updated_at,
    vigente, position_interval_sec, is_deleted
  ) values (
    extensions.gen_random_uuid(),
    v_org_name,
    v_email,
    v_uid,
    v_uid,
    v_org_id,
    now(),
    now(),
    true,
    v_pos_interval,
    false
  )
  on conflict (user_id, org_id)
  do update set
    email = coalesce(public.personal.email, excluded.email),
    nombre = coalesce(public.personal.nombre, excluded.nombre),
    owner_id = coalesce(public.personal.owner_id, excluded.owner_id),
    vigente = coalesce(public.personal.vigente, excluded.vigente),
    position_interval_sec = coalesce(public.personal.position_interval_sec, excluded.position_interval_sec),
    is_deleted = false,
    updated_at = now()
  returning id into v_personal_id;

  -- ✅ También aseguramos que la fila existente tenga org/email (por si venía incompleta)
  update public.personal
  set org_id = v_org_id,
      email = coalesce(email, v_email),
      updated_at = now()
  where user_id = v_uid
    and org_id = v_org_id
    and is_deleted = false;

  -- Legacy tables (no deben tumbar bootstrap)
  begin
    insert into public.app_user_roles (id, user_id, org_id, role, created_at)
    values (extensions.gen_random_uuid(), v_uid, v_org_id, v_role_legacy, now())
    on conflict (user_id, org_id)
    do update set role = excluded.role;
  exception when others then
    -- ignore
  end;

  begin
    insert into public.user_organizations (id, user_id, org_id, role, created_at)
    values (extensions.gen_random_uuid(), v_uid, v_org_id, v_role_legacy, now())
    on conflict (org_id, user_id)
    do update set role = excluded.role;
  exception when others then
    -- ignore
  end;

  return jsonb_build_object('org_id', v_org_id, 'role', v_role_text, 'personal_id', v_personal_id);
end;
$_$;


ALTER FUNCTION "public"."bootstrap_user_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_user_membership"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."bootstrap_user_membership"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bootstrap_user_membership"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."bootstrap_user_membership_for_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."bootstrap_user_membership_for_user"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bootstrap_user_membership_for_user"("p_user_id" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."cancel_invitation"("p_invite_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return true;
end;
$$;


ALTER FUNCTION "public"."cancel_invitation"("p_invite_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cancel_invitation"("p_invite_id" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."cancel_pending_tracker_invite"("p_org_id" "uuid", "p_email" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email_norm text := lower(trim(p_email));
  v_rows integer := 0;
begin
  -- Cancela "pendientes" forzando salida del conjunto UNIQUE:
  -- marcamos used_at y expiramos.
  update public.tracker_invites
  set
    used_at = now(),
    expires_at = least(expires_at, now()),
    is_active = false
  where org_id = p_org_id
    and email_norm = v_email_norm
    and used_at is null
    and accepted_at is null;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;


ALTER FUNCTION "public"."cancel_pending_tracker_invite"("p_org_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_pending_invite"("p_claim_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."claim_pending_invite"("p_claim_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_pending_invite"("p_claim_code" "text") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."compute_effective_app_role"("p_uid" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return 'viewer';
end;
$$;


ALTER FUNCTION "public"."compute_effective_app_role"("p_uid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."compute_effective_app_role"("p_uid" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."copy_tracker_log_to_positions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op en bootstrap
  return;
end;
$$;


ALTER FUNCTION "public"."copy_tracker_log_to_positions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."copy_tracker_log_to_positions"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."count_active_trackers"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return 0;
end;
$$;


ALTER FUNCTION "public"."count_active_trackers"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_active_trackers"("p_org_id" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_frecuencia" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_frecuencia" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_frecuencia" integer) IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone, "p_frecuencia_min" integer, "p_nombre" "text", "p_telefono" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone, "p_frecuencia_min" integer, "p_nombre" "text", "p_telefono" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone, "p_frecuencia_min" integer, "p_nombre" "text", "p_telefono" "text") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."create_geocerca"("_nombre" "text", "_geometry" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."create_geocerca"("_nombre" "text", "_geometry" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_geocerca"("_nombre" "text", "_geometry" "jsonb") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."create_organization_for_current_user"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."create_organization_for_current_user"("p_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_organization_for_current_user"("p_name" "text") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."create_personal_org_and_assign_owner"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."create_personal_org_and_assign_owner"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_personal_org_and_assign_owner"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."current_geocerca_id_for_tracker"("p_uid" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."current_geocerca_id_for_tracker"("p_uid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_geocerca_id_for_tracker"("p_uid" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.get_current_org_id();
$$;


ALTER FUNCTION "public"."current_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_org_id_from_memberships"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select null::uuid
$$;


ALTER FUNCTION "public"."current_org_id_from_memberships"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_role"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return 'viewer';
end;
$$;


ALTER FUNCTION "public"."current_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_role"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."current_tenant_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."current_tenant_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_tenant_id"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."current_user_email"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return null;
end;
$$;


ALTER FUNCTION "public"."current_user_email"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_user_email"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."current_user_org_ids"() RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return array[]::uuid[];
end;
$$;


ALTER FUNCTION "public"."current_user_org_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_user_org_ids"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."delete_all_geocercas_for_user"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return 0;
end;
$$;


ALTER FUNCTION "public"."delete_all_geocercas_for_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_all_geocercas_for_user"() IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."delete_geofence_hard"("p_geofence_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- retorno neutro en bootstrap
  return true;
end;
$$;


ALTER FUNCTION "public"."delete_geofence_hard"("p_geofence_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_geofence_hard"("p_geofence_id" "uuid") IS 'PREREQ bootstrap-safe para pasar 00300_preview_rls.sql; redefinida por 00400_preview_vft.sql';



CREATE OR REPLACE FUNCTION "public"."delete_user_full"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."delete_user_full"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_assignments_when_geofence_inactive"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."disable_assignments_when_geofence_inactive"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."effective_tracker_limit"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN 0;
END;
$$;


ALTER FUNCTION "public"."effective_tracker_limit"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_geocercas_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_geocercas_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_geocercas_total_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_geocercas_total_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_geocercas_total_limit_core"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_geocercas_total_limit_core"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_geocercas_total_limit_core_orig"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_geocercas_total_limit_core_orig"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_geocercas_total_limit_impl"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_geocercas_total_limit_impl"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_geofence_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_geofence_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_org_eq_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_org_eq_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_org_people_tracker_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_org_people_tracker_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_owner_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_owner_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_personal_tracker_limit_final"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_personal_tracker_limit_final"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_single_admin_invites"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_single_admin_invites"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_single_admin_per_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_single_admin_per_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_active_org_for_user"("p_user" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_active_org_for_user"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_admin_bootstrap"("p_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."ensure_admin_bootstrap"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_current_org_for_user"("p_user" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_current_org_for_user"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_default_org"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_default_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_default_org_for_current_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_default_org_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_default_org_for_user"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_default_org_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_geofence_id uuid;
begin
  if p_geocerca_id is null then
    return null;
  end if;

  select m.geofence_id into v_geofence_id
  from public.geocerca_geofence_map m
  where m.geocerca_id = p_geocerca_id;

  if v_geofence_id is not null then
    return v_geofence_id;
  end if;

  -- Intento 1: crear geofence mínimo (shadow)
  -- OJO: como no conocemos columnas NOT NULL de geofences,
  -- esto puede fallar. Si falla, elevamos un error claro con instrucción.
  begin
    insert into public.geofences (id)
    values (gen_random_uuid())
    returning id into v_geofence_id;
  exception
    when others then
      raise exception
        'No pude crear geofence shadow porque geofences requiere más columnas NOT NULL. Necesito el esquema de geofences (information_schema.columns) para generar el insert correcto. Error original: %',
        sqlerrm;
  end;

  insert into public.geocerca_geofence_map (geocerca_id, geofence_id)
  values (p_geocerca_id, v_geofence_id);

  return v_geofence_id;
end;
$$;


ALTER FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid", "p_org_id" "uuid", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_geofence_id uuid;

  v_name text;
  v_geojson jsonb;
  v_polygon jsonb;
  v_geom geometry;

  map_has_org_id boolean;
begin
  if p_geocerca_id is null then
    return null;
  end if;

  if p_org_id is null then
    raise exception 'ensure_geofence_for_geocerca: org_id es NULL (requerido).';
  end if;

  if p_user_id is null then
    raise exception 'ensure_geofence_for_geocerca: user_id es NULL (geofences.user_id es NOT NULL).';
  end if;

  -- ¿La tabla puente tiene org_id?
  select exists(
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='geocerca_geofence_map'
      and column_name='org_id'
  ) into map_has_org_id;

  -- 1) Si ya existe mapping, devolverlo
  if map_has_org_id then
    select m.geofence_id into v_geofence_id
    from public.geocerca_geofence_map m
    where m.org_id = p_org_id
      and m.geocerca_id = p_geocerca_id
    limit 1;
  else
    select m.geofence_id into v_geofence_id
    from public.geocerca_geofence_map m
    where m.geocerca_id = p_geocerca_id
    limit 1;
  end if;

  if v_geofence_id is not null then
    return v_geofence_id;
  end if;

  -- 2) Leer geocerca (FeatureCollection)
  select
    coalesce(g.name, g.nombre, '[AUTO] geocerca ' || left(g.id::text, 8)) as name_resolved,
    g.geojson
  into v_name, v_geojson
  from public.geocercas g
  where g.id = p_geocerca_id;

  if v_geojson is null then
    raise exception 'Geocerca % no tiene geojson; no se puede construir geofence.', p_geocerca_id;
  end if;

  -- 3) polygon_geojson (para pasar CHECK geofences_shape_ck)
  if coalesce(v_geojson->>'type','') = 'FeatureCollection' then
    v_polygon := v_geojson->'features'->0->'geometry';
  elsif coalesce(v_geojson->>'type','') = 'Feature' then
    v_polygon := v_geojson->'geometry';
  else
    v_polygon := v_geojson;
  end if;

  if v_polygon is null then
    raise exception 'No pude extraer geometry de geojson para geocerca %.', p_geocerca_id;
  end if;

  -- 4) geom multipolygon (geofences.geom = MultiPolygon)
  v_geom := st_multi(st_setsrid(st_geomfromgeojson(v_polygon::text), 4326));

  -- 5) Insert geofence shadow cumpliendo el CHECK (polygon_geojson NOT NULL)
  insert into public.geofences
    (name, org_id, user_id, geojson, polygon_geojson, geom, source_geocerca_id, active, updated_at)
  values
    (v_name, p_org_id, p_user_id, v_geojson, v_polygon, v_geom, p_geocerca_id, true, now())
  returning id into v_geofence_id;

  -- 6) Guardar mapping (UPDATE/INSERT) incluyendo org_id si aplica
  if map_has_org_id then
    update public.geocerca_geofence_map
    set geofence_id = v_geofence_id,
        updated_at = now()
    where org_id = p_org_id
      and geocerca_id = p_geocerca_id;

    if not found then
      insert into public.geocerca_geofence_map (org_id, geocerca_id, geofence_id, created_at, updated_at)
      values (p_org_id, p_geocerca_id, v_geofence_id, now(), now());
    end if;
  else
    update public.geocerca_geofence_map
    set geofence_id = v_geofence_id,
        updated_at = now()
    where geocerca_id = p_geocerca_id;

    if not found then
      insert into public.geocerca_geofence_map (geocerca_id, geofence_id, created_at, updated_at)
      values (p_geocerca_id, v_geofence_id, now(), now());
    end if;
  end if;

  return v_geofence_id;
end;
$$;


ALTER FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid", "p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_geofence_from_geocerca"("p_geocerca_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_geofence_from_geocerca"("p_geocerca_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_membership_for_current_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_membership_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_membership_for_current_user"("p_org" "uuid", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_membership_for_current_user"("p_org" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_membership_for_user"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_membership_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_admin_core"("p_user_id" "uuid", "p_email" "text", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_org_for_admin_core"("p_user_id" "uuid", "p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_admin_profile"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op (bootstrap-safe)
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."ensure_org_for_admin_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_admin_profiles"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_org_for_admin_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_admin_user_profile"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_org_for_admin_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_current_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_org_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_new_admin"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_org_for_new_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_owner_role"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_org_for_owner_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_org_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_owner_in_org_members"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.organizations
  where id = p_org_id;

  if v_owner is null then
    return;
  end if;

  -- Inserta si no existe
  insert into public.org_members (org_id, user_id, role, created_at, is_active)
  select p_org_id, v_owner, 'owner', now(), true
  where not exists (
    select 1
    from public.org_members om
    where om.org_id = p_org_id
      and om.user_id = v_owner
  );

  -- Si existe pero está mal (role/is_active), lo corrige
  update public.org_members
  set role = 'owner',
      is_active = true
  where org_id = p_org_id
    and user_id = v_owner
    and (coalesce(role,'') <> 'owner' or coalesce(is_active,false) <> true);

end;
$$;


ALTER FUNCTION "public"."ensure_owner_in_org_members"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_owner_org_for_user"("p_user_id" "uuid", "p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_owner_org_for_user"("p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_personal_for_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_nombre" "text", "p_telefono" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_personal_for_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_nombre" "text", "p_telefono" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_personal_for_user"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_personal_for_user"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_personal_org"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_personal_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_personal_org_for"("p_uid" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_personal_org_for"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_personal_org_for_user"("p_user_id" "uuid", "p_org_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_personal_org_for_user"("p_user_id" "uuid", "p_org_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_profile"("p_uid" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_profile"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_default_membership"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_single_default_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_system_user_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_system_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_tenant_for_org"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_tenant_for_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_tenant_id_for_org"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tenant_id uuid;
begin
  if p_org_id is null then
    raise exception 'org_id es NULL: no se puede derivar tenant_id';
  end if;

  -- intenta leer
  select m.tenant_id
    into v_tenant_id
  from public.org_tenant_map m
  where m.org_id = p_org_id
  limit 1;

  -- si no existe, crea fallback tenant_id = org_id
  if v_tenant_id is null then
    v_tenant_id := p_org_id;

    -- inserta si no existe (idempotente)
    insert into public.org_tenant_map (org_id, tenant_id)
    values (p_org_id, v_tenant_id)
    on conflict (org_id) do nothing;

    -- vuelve a leer por si hubo carrera
    select m.tenant_id
      into v_tenant_id
    from public.org_tenant_map m
    where m.org_id = p_org_id
    limit 1;

    if v_tenant_id is null then
      -- ultra guard (no debería pasar)
      v_tenant_id := p_org_id;
    end if;
  end if;

  return v_tenant_id;
end;
$$;


ALTER FUNCTION "public"."ensure_tenant_id_for_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_tracker_membership"("p_email" "text", "p_org_id" "uuid", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_tracker_membership"("p_email" "text", "p_org_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_tracker_membership"("p_user_id" "uuid", "p_email" "text", "p_org_id" "uuid", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_tracker_membership"("p_user_id" "uuid", "p_email" "text", "p_org_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_context"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return '{}'::jsonb;
end;
$$;


ALTER FUNCTION "public"."ensure_user_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_membership"("p_user_id" "uuid", "p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_user_membership"("p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_org_context"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return '{}'::jsonb;
end;
$$;


ALTER FUNCTION "public"."ensure_user_org_context"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_role"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_user_role"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_tenant"("p_user" "uuid", "p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_user_tenant"("p_user" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_users_public_by_uid"("p_uid" "uuid", "p_email" "text", "p_role" "text", "p_tenant_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_users_public_by_uid"("p_uid" "uuid", "p_email" "text", "p_role" "text", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_users_public_for_auth_user"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_users_public_for_auth_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_users_public_for_current_user"("p_role" "text", "p_full_name" "text", "p_phone_e164" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return null::uuid;
end;
$$;


ALTER FUNCTION "public"."ensure_users_public_for_current_user"("p_role" "text", "p_full_name" "text", "p_phone_e164" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_default_org_id_for_current_user"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select null::uuid;
$$;


ALTER FUNCTION "public"."get_or_create_default_org_id_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_email"("p_email" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(p_email));
$$;


ALTER FUNCTION "public"."normalize_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone"("p_phone" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select regexp_replace(coalesce(p_phone,''), '[^0-9]+', '', 'g');
$$;


ALTER FUNCTION "public"."normalize_phone"("p_phone" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."personal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "email" "text" NOT NULL,
    "telefono" "text",
    "documento" "text",
    "owner_id" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "apellido" "text",
    "telefono_raw" "text",
    "vigente" boolean DEFAULT true NOT NULL,
    "fecha_inicio" "date",
    "fecha_fin" "date",
    "org_id" "uuid" DEFAULT "public"."get_or_create_default_org_id_for_current_user"(),
    "position_interval_sec" integer DEFAULT 300 NOT NULL,
    "activo" boolean GENERATED ALWAYS AS ("vigente") STORED,
    "telefono_norm" "text",
    "activo_bool" boolean,
    "fingerprint" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "email_norm" "text" GENERATED ALWAYS AS ("public"."normalize_email"("email")) STORED,
    "phone_norm" "text" GENERATED ALWAYS AS ("public"."normalize_phone"("telefono")) STORED,
    "identity_key" "text" GENERATED ALWAYS AS (
CASE
    WHEN (NULLIF("lower"(TRIM(BOTH FROM "email")), ''::"text") IS NOT NULL) THEN ('e:'::"text" || "lower"(TRIM(BOTH FROM "email")))
    WHEN (NULLIF(TRIM(BOTH FROM "telefono"), ''::"text") IS NOT NULL) THEN ('p:'::"text" || TRIM(BOTH FROM "telefono"))
    ELSE NULL::"text"
END) STORED,
    "user_id" "uuid",
    CONSTRAINT "personal_active_requires_identity" CHECK (((COALESCE("is_deleted", false) = true) OR ("identity_key" IS NOT NULL))),
    CONSTRAINT "personal_chk_position_interval_min" CHECK (("position_interval_sec" >= 300)),
    CONSTRAINT "personal_fecha_intervalo_chk" CHECK ((("fecha_inicio" IS NULL) OR ("fecha_fin" IS NULL) OR ("fecha_fin" >= "fecha_inicio"))),
    CONSTRAINT "personal_phone_e164_chk" CHECK ((("telefono" IS NULL) OR ("telefono" ~ '^\+[1-9]\d{1,14}$'::"text"))),
    CONSTRAINT "personal_position_interval_sec_check" CHECK ((("position_interval_sec" IS NULL) OR ("position_interval_sec" >= 300)))
);

ALTER TABLE ONLY "public"."personal" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_admin_personal"() RETURNS SETOF "public"."personal"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select *
  from public.personal
  where false;
$$;


ALTER FUNCTION "public"."f_admin_personal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_asignacion"("p_id" "uuid", "p_end_date" "date") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return true;
end;
$$;


ALTER FUNCTION "public"."finish_asignacion"("p_id" "uuid", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fix_missing_membership_from_profile"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return;
end;
$$;


ALTER FUNCTION "public"."fix_missing_membership_from_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_normalize_phone_e164"("p_raw" "text", "p_default_cc" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro: devuelve el raw si viene, o null
  return nullif(btrim(p_raw), '');
end;
$$;


ALTER FUNCTION "public"."fn_normalize_phone_e164"("p_raw" "text", "p_default_cc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_normalize_phone_ec"("t" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro
  return nullif(btrim(t), '');
end;
$$;


ALTER FUNCTION "public"."fn_normalize_phone_ec"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_personal_set_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op neutro para trigger
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_personal_set_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gc_get_active_org_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  uid uuid := auth.uid();
  v uuid;
begin
  if uid is null then
    return null;
  end if;

  -- 2.1) Preferencia persistida en user_settings si existe y es válida
  if to_regclass('public.user_settings') is not null then
    select current_org_id into v
    from public.user_settings
    where user_id = uid;

    if v is not null and public.gc_is_member_of_org(uid, v) then
      return v;
    end if;
  end if;

  -- 2.2) memberships: is_default primero, luego el más reciente
  if to_regclass('public.memberships') is not null then
    execute
      'select org_id
         from public.memberships
        where user_id = $1
          and revoked_at is null
        order by is_default desc, created_at desc nulls last
        limit 1'
    into v using uid;

    if v is not null then
      return v;
    end if;
  end if;

  -- 2.3) app_user_roles: is_default primero, luego created_at
  if to_regclass('public.app_user_roles') is not null then
    execute
      'select org_id
         from public.app_user_roles
        where user_id = $1
          and (revoked_at is null)
        order by is_default desc, created_at desc nulls last
        limit 1'
    into v using uid;

    if v is not null then
      return v;
    end if;
  end if;

  -- 2.4) org_users: fallback
  if to_regclass('public.org_users') is not null then
    execute
      'select org_id
         from public.org_users
        where user_id = $1
        limit 1'
    into v using uid;

    if v is not null then
      return v;
    end if;
  end if;

  return null;
end;
$_$;


ALTER FUNCTION "public"."gc_get_active_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gc_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  ok boolean := false;
begin
  if p_user_id is null or p_org_id is null then
    return false;
  end if;

  -- memberships
  if to_regclass('public.memberships') is not null then
    execute
      'select exists(
         select 1 from public.memberships
         where user_id = $1 and org_id = $2
           and revoked_at is null
       )'
    into ok using p_user_id, p_org_id;

    if ok then return true; end if;
  end if;

  -- app_user_roles
  if to_regclass('public.app_user_roles') is not null then
    execute
      'select exists(
         select 1 from public.app_user_roles
         where user_id = $1 and org_id = $2
           and (revoked_at is null)
       )'
    into ok using p_user_id, p_org_id;

    if ok then return true; end if;
  end if;

  -- org_users
  if to_regclass('public.org_users') is not null then
    execute
      'select exists(
         select 1 from public.org_users
         where user_id = $1 and org_id = $2
       )'
    into ok using p_user_id, p_org_id;

    if ok then return true; end if;
  end if;

  return false;
end;
$_$;


ALTER FUNCTION "public"."gc_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocerca_geojson_to_geometry"("p_geojson" "jsonb") RETURNS "public"."geometry"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  g jsonb;
  geom geometry;
begin
  if p_geojson is null then
    return null;
  end if;

  -- FeatureCollection -> features[0].geometry
  if coalesce(p_geojson->>'type','') = 'FeatureCollection' then
    g := p_geojson->'features'->0->'geometry';
    if g is null then
      return null;
    end if;
    geom := st_setsrid(st_geomfromgeojson(g::text), 4326);
    return st_multi(geom);
  end if;

  -- Feature -> geometry
  if coalesce(p_geojson->>'type','') = 'Feature' then
    g := p_geojson->'geometry';
    if g is null then
      return null;
    end if;
    geom := st_setsrid(st_geomfromgeojson(g::text), 4326);
    return st_multi(geom);
  end if;

  -- Geometry directa
  if coalesce(p_geojson->>'type','') in ('Polygon','MultiPolygon') then
    geom := st_setsrid(st_geomfromgeojson(p_geojson::text), 4326);
    return st_multi(geom);
  end if;

  -- Otros tipos no soportados para geofences.geom multipolygon
  return null;
end;
$$;


ALTER FUNCTION "public"."geocerca_geojson_to_geometry"("p_geojson" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocerca_get"("p_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::jsonb;
END;
$$;


ALTER FUNCTION "public"."geocerca_get"("p_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_bi_bu"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_bi_bu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_bi_bu__orig"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_bi_bu__orig"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_delete"("p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."geocercas_delete"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_delete_iof"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_delete_iof"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_enforce_canonical_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_enforce_canonical_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_fix_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_fix_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_insert_iof"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_insert_iof"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_list"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."geocercas_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_set_geom"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_set_geom"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_sync_nombre_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_sync_nombre_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_update_iof"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geocercas_update_iof"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_upsert"("p_id" "uuid", "p_nombre" "text", "p_geojson" "jsonb", "p_visible" boolean, "p_activa" boolean, "p_color" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::jsonb;
END;
$$;


ALTER FUNCTION "public"."geocercas_upsert"("p_id" "uuid", "p_nombre" "text", "p_geojson" "jsonb", "p_visible" boolean, "p_activa" boolean, "p_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_v_delete"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."geocercas_v_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_v_insert"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."geocercas_v_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geocercas_v_update"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."geocercas_v_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geofence_upsert"("_id" "uuid", "_org" "uuid", "_name" "text", "_geojson" "jsonb", "_active" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::jsonb;
END;
$$;


ALTER FUNCTION "public"."geofence_upsert"("_id" "uuid", "_org" "uuid", "_name" "text", "_geojson" "jsonb", "_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geofences_fill_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geofences_fill_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geofences_set_user_and_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geofences_set_user_and_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geofences_sync_geom_json"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geofences_sync_geom_json"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geofences_sync_geometry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."geofences_sync_geometry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."geojson_to_coords"("g" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::jsonb;
END;
$$;


ALTER FUNCTION "public"."geojson_to_coords"("g" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_roots"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_app_roots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_setting"("p_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::text;
END;
$$;


ALTER FUNCTION "public"."get_app_setting"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_costos_asignaciones"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_costos_asignaciones"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_costos_asignaciones_v2"("p_org_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_costos_asignaciones_v2"("p_org_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_costos_asignaciones_v2"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_costos_asignaciones_v2"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_costos_detalle_by_org"("p_org_id" "uuid", "p_desde" timestamp with time zone, "p_hasta" timestamp with time zone, "p_personal_id" "uuid", "p_activity_id" "uuid", "p_geocerca_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_costos_detalle_by_org"("p_org_id" "uuid", "p_desde" timestamp with time zone, "p_hasta" timestamp with time zone, "p_personal_id" "uuid", "p_activity_id" "uuid", "p_geocerca_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_org"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_current_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_org_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Fuente única server-side (SaaS universal)
  return public.gc_get_active_org_id();
end;
$$;


ALTER FUNCTION "public"."get_current_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_org_id_for_current_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_current_org_id_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_org_id_for_user"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_current_org_id_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_role"("p_org_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::text;
END;
$$;


ALTER FUNCTION "public"."get_current_role"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_org_and_role"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_current_user_org_and_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_geofence_id"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_default_geofence_id"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_org"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_default_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_org_for_uid"("p_uid" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq (neutral return)
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_default_org_for_uid"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_default_org_id_for_current_user"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_default_org_id_for_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_geocercas_for_current_org"() RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."get_geocercas_for_current_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_geofence_context"("p_geofence_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_geofence_context"("p_geofence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_max_trackers_for_org"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN 0;
END;
$$;


ALTER FUNCTION "public"."get_max_trackers_for_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_context"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_my_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_context_for_user"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_my_context_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_profile"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_my_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_default_org"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_or_create_default_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_id_for_user"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_org_id_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_limits"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_org_limits"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_owner_org_id"("p_uid" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_owner_org_id"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_request_user_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_request_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_user_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."get_system_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tracker_invite_claim"("p_invite_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."get_tracker_invite_claim"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profiles_direct_writes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq guard
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_profiles_direct_writes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_admin_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq trigger
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_admin_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("p_org" "uuid", "p_min" "public"."role_type") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."has_role"("p_org" "uuid", "p_min" "public"."role_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."init_admin_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq trigger
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."init_admin_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_geocerca"("nombre" "text", "wkt" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."insert_geocerca"("nombre" "text", "wkt" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_geocerca_json"("nombre" "text", "coords" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."insert_geocerca_json"("nombre" "text", "coords" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_recorded_at" timestamp with time zone, "p_source" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_recorded_at" timestamp with time zone, "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_captured_at" timestamp with time zone, "p_meta" "jsonb", "p_geofence_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_captured_at" timestamp with time zone, "p_meta" "jsonb", "p_geofence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_member"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."invite_member"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_member_by_email"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."invite_member_by_email"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_context"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_admin_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_owner"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.slug in ('admin','owner')
  );
$$;


ALTER FUNCTION "public"."is_admin_or_owner"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_role"("p_role" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_admin_role"("p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_role"("p_role" "public"."role_type") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_admin_role"("p_role" "public"."role_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_root"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_app_root"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_internal_bridge"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_internal_bridge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member"("p_org" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_member"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select true
$$;


ALTER FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select true
$$;


ALTER FUNCTION "public"."is_org_admin"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("p_org_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select true
$$;


ALTER FUNCTION "public"."is_org_admin"("p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select true
$$;


ALTER FUNCTION "public"."is_org_member"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_owner"("p_org_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_org_owner"("p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_owner"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_root_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select true
$$;


ALTER FUNCTION "public"."is_root_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_root_owner"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_root_owner"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tracker_assigned_to_geofence"("p_org_id" "uuid", "p_geofence_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select true
$$;


ALTER FUNCTION "public"."is_tracker_assigned_to_geofence"("p_org_id" "uuid", "p_geofence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_asignaciones"("p_tenant_id" "uuid", "p_personal_id" "uuid", "p_geocerca_id" "uuid", "p_estado" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."list_asignaciones"("p_tenant_id" "uuid", "p_personal_id" "uuid", "p_geocerca_id" "uuid", "p_estado" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_geocercas_for_assign"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."list_geocercas_for_assign"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_members_with_email"("p_org" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."list_members_with_email"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_user_org_ids"("p_user_id" "uuid") RETURNS TABLE("org_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  tbl text;
  org_col text;
  user_col text;
  candidates text[] := array[
    'memberships',
    'org_members',
    'org_memberships',
    'org_users',
    'user_orgs',
    'user_organizations',
    'org_membership',
    'org_user',
    'user_org_settings'
  ];
begin
  if p_user_id is null then
    return;
  end if;

  -- Loop candidate tables, auto-detect columns
  foreach tbl in array candidates loop
    if to_regclass('public.' || tbl) is null then
      continue;
    end if;

    -- Detect user column
    select c.column_name
      into user_col
    from information_schema.columns c
    where c.table_schema='public'
      and c.table_name=tbl
      and c.column_name in ('user_id','auth_user_id','owner_id')
    order by case c.column_name
      when 'user_id' then 1
      when 'auth_user_id' then 2
      when 'owner_id' then 3
      else 99 end
    limit 1;

    if user_col is null then
      continue;
    end if;

    -- Detect org column
    select c.column_name
      into org_col
    from information_schema.columns c
    where c.table_schema='public'
      and c.table_name=tbl
      and c.column_name in ('org_id','organization_id','tenant_id')
    order by case c.column_name
      when 'org_id' then 1
      when 'organization_id' then 2
      when 'tenant_id' then 3
      else 99 end
    limit 1;

    if org_col is null then
      continue;
    end if;

    -- Emit org_ids from that table
    return query execute format(
      'select %I::uuid as org_id from public.%I where %I = $1 and %I is not null',
      org_col, tbl, user_col, org_col
    ) using p_user_id;
  end loop;

  -- Deduplicate at caller (we'll use DISTINCT there)
end;
$_$;


ALTER FUNCTION "public"."list_user_org_ids"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_event"("p_action" "text", "p_entity" "text", "p_entity_id" "uuid", "p_details" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- no-op prereq: real implementation in 00400_preview_vft.sql
  RETURN;
END;
$$;


ALTER FUNCTION "public"."log_event"("p_action" "text", "p_entity" "text", "p_entity_id" "uuid", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_location_and_attendance"("p_lat" double precision, "p_lng" double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."log_location_and_attendance"("p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lower"("p_role" "public"."role_type") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN p_role::text;
END;
$$;


ALTER FUNCTION "public"."lower"("p_role" "public"."role_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."memberships_role_guard"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."memberships_role_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_personal_duplicates"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."merge_personal_duplicates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_to_tenant_by_name"("p_table" "regclass", "p_id_col" "text", "p_tenant_col" "text", "p_name_col" "text", "p_target_tenant" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."merge_to_tenant_by_name"("p_table" "regclass", "p_id_col" "text", "p_tenant_col" "text", "p_name_col" "text", "p_target_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start" "date", "p_end" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start_ts" timestamp with time zone, "p_end_ts" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start_ts" timestamp with time zone, "p_end_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_org_ids"() RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN ARRAY[]::uuid[];
END;
$$;


ALTER FUNCTION "public"."my_org_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone_for_personal"("p_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real normalization logic overridden in 00400_preview_vft.sql
  RETURN p_phone;
END;
$$;


ALTER FUNCTION "public"."normalize_phone_for_personal"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_org_invite_accepted"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real side effects implemented in 00400_preview_vft.sql
  RETURN;
END;
$$;


ALTER FUNCTION "public"."on_org_invite_accepted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_organization_created"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;


ALTER FUNCTION "public"."on_organization_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_acl_probe"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real ACL logic overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."personal_acl_probe"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_biu_defaults_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op trigger: real logic overridden in 00400_preview_vft.sql
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."personal_biu_defaults_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_compute_fingerprint"("p_nombre" "text", "p_apellido" "text", "p_email" "text", "p_telefono_norm" "text", "p_org_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real fingerprint logic overridden in 00400_preview_vft.sql
  RETURN '';
END;
$$;


ALTER FUNCTION "public"."personal_compute_fingerprint"("p_nombre" "text", "p_apellido" "text", "p_email" "text", "p_telefono_norm" "text", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_delete_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real deletion logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."personal_delete_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_has_active_assignments"("p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real logic overridden in 00400_preview_vft.sql
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."personal_has_active_assignments"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_list"("_q" "text", "_only_active" boolean) RETURNS SETOF "public"."personal"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- no-op bootstrap-safe: retorna 0 filas
  return;
end;
$$;


ALTER FUNCTION "public"."personal_list"("_q" "text", "_only_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."personal_list"("_q" "text", "_only_active" boolean) IS 'PREREQ bootstrap-safe (no-op). Exists only to satisfy GRANT/REVOKE in 00300; redefined in 00400.';



CREATE OR REPLACE FUNCTION "public"."personal_list"("_q" "text", "_include_deleted" boolean, "_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real listing logic overridden in 00400_preview_vft.sql
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."personal_list"("_q" "text", "_include_deleted" boolean, "_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_set_derived"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real derivation logic overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;


ALTER FUNCTION "public"."personal_set_derived"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_set_vigente"("p_id" "uuid", "p_vigente" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."personal_set_vigente"("p_id" "uuid", "p_vigente" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_soft_delete"("p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real soft-delete logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."personal_soft_delete"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_toggle_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real toggle logic overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."personal_toggle_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_upsert_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real upsert logic overridden in 00400_preview_vft.sql
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."personal_upsert_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pick_active_org_for_user"("p_user" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real logic overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."pick_active_org_for_user"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_membership_role_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op trigger: real logic overridden in 00400_preview_vft.sql
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_membership_role_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_past_asignaciones"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op trigger: real logic overridden in 00400_preview_vft.sql
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_past_asignaciones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_personal_duplicate_on_undelete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op trigger: real logic overridden in 00400_preview_vft.sql
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_personal_duplicate_on_undelete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_change_for_non_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op trigger: real logic overridden in 00400_preview_vft.sql
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_role_change_for_non_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_geofence_transitions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op trigger
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."process_geofence_transitions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_users_public_role_from_memberships"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;


ALTER FUNCTION "public"."recalc_users_public_role_from_memberships"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_member"("p_org" "uuid", "p_user" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."remove_member"("p_org" "uuid", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."repair_users_without_membership"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;


ALTER FUNCTION "public"."repair_users_without_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."repair_users_without_roles"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN;
END;
$$;


ALTER FUNCTION "public"."repair_users_without_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real implementation overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_geofence_id_from_geocerca"("p_geocerca_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real resolution logic overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."resolve_geofence_id_from_geocerca"("p_geocerca_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_org_for_tracker_dashboard"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Igual que get_current_org_id() para evitar divergencias
  return public.gc_get_active_org_id();
end;
$$;


ALTER FUNCTION "public"."resolve_org_for_tracker_dashboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_org_for_tracker_dashboard_for_uid"("p_uid" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := p_uid;
  v_org uuid;
begin
  if v_uid is null then
    return null;
  end if;

  select aur.org_id
    into v_org
  from public.app_user_roles aur
  where aur.user_id = v_uid
    and aur.org_id is not null
    and exists (
      select 1
      from public.tracker_assignments ta
      where ta.org_id = aur.org_id
        and ta.active = true
    )
  order by aur.created_at desc
  limit 1;

  if v_org is not null then
    return v_org;
  end if;

  select aur.org_id
    into v_org
  from public.app_user_roles aur
  where aur.user_id = v_uid
    and aur.org_id is not null
  order by aur.created_at desc
  limit 1;

  return v_org;
end;
$$;


ALTER FUNCTION "public"."resolve_org_for_tracker_dashboard_for_uid"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_tenant_id_for_org"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real resolution logic overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."resolve_tenant_id_for_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_tracker_user_id"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real resolution logic overridden in 00400_preview_vft.sql
  RETURN NULL::uuid;
END;
$$;


ALTER FUNCTION "public"."resolve_tracker_user_id"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."role_id_to_role"("p_role_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- prereq no-op: real mapping logic overridden in 00400_preview_vft.sql
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."role_id_to_role"("p_role_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."role_priority"("p_role" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."role_priority"("p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."role_rank"("p_role" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."role_rank"("p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_accept_invite"("p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."rpc_accept_invite"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_accept_pending_invites_for_me"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."rpc_accept_pending_invites_for_me"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_admin_assign_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."rpc_admin_assign_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_admin_upsert_phone"("p_user_id" "uuid", "p_telefono" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."rpc_admin_upsert_phone"("p_user_id" "uuid", "p_telefono" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_crear_geocerca"("p_nombre" "text", "p_geom" "jsonb", "p_activa" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."rpc_crear_geocerca"("p_nombre" "text", "p_geom" "jsonb", "p_activa" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_create_tracker_invite"("p_org_id" "uuid", "p_email" "text", "p_expires_hours" integer, "p_note" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."rpc_create_tracker_invite"("p_org_id" "uuid", "p_email" "text", "p_expires_hours" integer, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_personal_list"("p_org" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '[]'::jsonb;
END;
$$;


ALTER FUNCTION "public"."rpc_personal_list"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_plan_tracker_vigente_usage"("org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN '{}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."rpc_plan_tracker_vigente_usage"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_provision_tracker_and_assign"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."rpc_provision_tracker_and_assign"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_set_current_org"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."rpc_set_current_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_tracker_can_send"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."rpc_tracker_can_send"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_upsert_tracker_assignment"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."rpc_upsert_tracker_assignment"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_add_to_publication"("p_pubname" "text", "p_schema" "text", "p_tablename" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."safe_add_to_publication"("p_pubname" "text", "p_schema" "text", "p_tablename" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_geom_from_geojson"("js" "jsonb") RETURNS "public"."geometry"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."safe_geom_from_geojson"("js" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."session_org_id_safe"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."session_org_id_safe"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_org"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.set_current_org(p_org_id);
$$;


ALTER FUNCTION "public"."set_active_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_created_by"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."set_created_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_created_by_from_auth"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."set_created_by_from_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_org"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  -- permitir “limpiar” current org
  if p_org_id is null then
    insert into public.user_settings(user_id)
    values (uid)
    on conflict (user_id) do nothing;

    update public.user_settings
    set current_org_id = null
    where user_id = uid;

    return null;
  end if;

  if not public.gc_is_member_of_org(uid, p_org_id) then
    raise exception 'not_member_of_org';
  end if;

  insert into public.user_settings(user_id, current_org_id)
  values (uid, p_org_id)
  on conflict (user_id)
  do update set current_org_id = excluded.current_org_id;

  return p_org_id;
end;
$$;


ALTER FUNCTION "public"."set_current_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_org_on_invite_accept"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN;
END;
$$;


ALTER FUNCTION "public"."set_current_org_on_invite_accept"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_tracker_assignments_from_activity_assignments"() RETURNS TABLE("inserted" integer, "updated" integer, "deactivated" integer, "note" "text")
    LANGUAGE "plpgsql"
    AS $_$
declare
  has_geofence_id boolean;
  has_geocerca_id boolean;
  has_active boolean;
  geofence_expr text;
  active_expr text;
  sql_upsert text;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_assignments' and column_name='geofence_id'
  ) into has_geofence_id;

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_assignments' and column_name='geocerca_id'
  ) into has_geocerca_id;

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_assignments' and column_name='active'
  ) into has_active;

  -- Si no existe ningún vínculo a geocerca, NO se puede sincronizar desde aquí.
  if (not has_geofence_id) and (not has_geocerca_id) then
    inserted := 0;
    updated := 0;
    deactivated := 0;
    note := 'activity_assignments NO tiene geofence_id ni geocerca_id. Esta tabla NO sirve como fuente para Tracker. Usa la tabla que sí tiene geofence_id.';
    return;
  end if;

  geofence_expr := case
    when has_geofence_id then 'a.geofence_id'
    else 'a.geocerca_id'
  end;

  active_expr := case
    when has_active then 'coalesce(a.active,true)'
    else 'true'
  end;

  sql_upsert := format($q$
    with src as (
      select
        a.tenant_id::uuid as org_id,
        a.tracker_user_id::uuid as tracker_user_id,
        %s::uuid as geofence_id,
        a.start_date::date as start_date,
        a.end_date::date as end_date,
        %s as active
      from public.activity_assignments a
      where a.tenant_id is not null
        and a.tracker_user_id is not null
        and %s is not null
    ),
    up as (
      insert into public.tracker_assignments (org_id, tracker_user_id, geofence_id, active, start_date, end_date)
      select org_id, tracker_user_id, geofence_id, active, start_date, end_date
      from src
      on conflict (org_id, tracker_user_id, geofence_id, start_date, end_date)
      do update set active = excluded.active
      returning (xmax = 0) as inserted_flag
    )
    select
      sum(case when inserted_flag then 1 else 0 end)::int as inserted,
      sum(case when not inserted_flag then 1 else 0 end)::int as updated
    from up
  $q$, geofence_expr, active_expr, geofence_expr);

  execute sql_upsert into inserted, updated;

  deactivated := 0;
  note := 'OK: sync desde activity_assignments';

  return;
end;
$_$;


ALTER FUNCTION "public"."sync_tracker_assignments_from_activity_assignments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_tracker_assignments_from_asignaciones"() RETURNS TABLE("inserted" integer, "updated" integer, "deactivated" integer, "note" "text")
    LANGUAGE "plpgsql"
    AS $_$
declare
  has_user_id boolean;
  has_personal_id boolean;
  personal_has_user_id boolean;

  has_org_id boolean;
  has_tenant_id boolean;

  tracker_user_expr text;
  source_user_expr text;

  start_date_expr text;
  end_date_expr text;
  active_expr text;

  sql_upsert text;
  sql_deactivate text;

  skipped_missing_tenant int;
begin
  -- columnas
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='asignaciones' and column_name='user_id')
    into has_user_id;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='asignaciones' and column_name='personal_id')
    into has_personal_id;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='personal' and column_name='user_id')
    into personal_has_user_id;

  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='asignaciones' and column_name='org_id')
    into has_org_id;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='asignaciones' and column_name='tenant_id')
    into has_tenant_id;

  if not has_tenant_id then
    raise exception 'asignaciones no tiene tenant_id. tracker_assignments requiere tenant_id válido (FK a tenants).';
  end if;

  -- user resolver
  if has_user_id and has_personal_id and personal_has_user_id then
    tracker_user_expr := 'coalesce(a.user_id::uuid, (select p.user_id::uuid from public.personal p where p.id=a.personal_id limit 1))';
    source_user_expr  := tracker_user_expr;
  elsif has_user_id then
    tracker_user_expr := 'a.user_id::uuid';
    source_user_expr  := 'a.user_id::uuid';
  elsif has_personal_id and personal_has_user_id then
    tracker_user_expr := '(select p.user_id::uuid from public.personal p where p.id=a.personal_id limit 1)';
    source_user_expr  := tracker_user_expr;
  else
    raise exception 'No se puede resolver tracker_user_id (user_id/personal.user_id).';
  end if;

  start_date_expr := 'coalesce(a.start_date, lower(a.period), current_date)::date';
  end_date_expr   := 'coalesce(a.end_date, upper(a.period), current_date)::date';

  active_expr := $ae$
    (
      coalesce(a.is_deleted,false) = false
      and (
        coalesce(a.estado,'') ilike any(array['activa','activo','active','enabled'])
        or coalesce(a.status,'') ilike any(array['activa','activo','active','enabled'])
        or (a.estado is null and a.status is null)
      )
      and (
        current_date between coalesce(a.start_date, lower(a.period), current_date)::date
                        and coalesce(a.end_date, upper(a.period), current_date)::date
      )
    )
  $ae$;

  -- contar saltadas por tenant inexistente (diagnóstico)
  execute format($q$
    select count(*)::int
    from public.asignaciones a
    left join public.tenants t on t.id = a.tenant_id
    where a.geocerca_id is not null
      and a.tenant_id is not null
      and t.id is null
  $q$) into skipped_missing_tenant;

  -- UPSERT con dedupe y tenant FK-safe:
  -- - tenant_id SIEMPRE = a.tenant_id
  -- - org_id = a.org_id (si existe) ELSE null
  sql_upsert := format($q$
    with src_raw as (
      select
        a.tenant_id::uuid as tenant_id,
        %s as org_id,
        %s as tracker_user_id,
        public.ensure_geofence_for_geocerca(a.geocerca_id, coalesce(a.org_id, a.tenant_id)::uuid, %s) as geofence_id,
        %s as start_date,
        %s as end_date,
        a.frequency_minutes::int as frequency_minutes,
        %s as active,
        a.activity_id::uuid as activity_id,
        a.created_at as created_at
      from public.asignaciones a
      join public.tenants t on t.id = a.tenant_id   -- << asegura FK
      where a.geocerca_id is not null
        and a.tenant_id is not null
        and %s is not null
    ),
    src_dedup as (
      select
        tenant_id,
        org_id,
        tracker_user_id,
        geofence_id,
        start_date,
        end_date,
        coalesce(min(frequency_minutes), 5)::int as frequency_minutes,
        bool_or(active) as active,
        (array_agg(activity_id order by created_at desc nulls last))[1] as activity_id
      from src_raw
      group by tenant_id, org_id, tracker_user_id, geofence_id, start_date, end_date
    ),
    up as (
      insert into public.tracker_assignments
        (tenant_id, org_id, tracker_user_id, geofence_id, start_date, end_date, frequency_minutes, active, activity_id, updated_at)
      select
        tenant_id, org_id, tracker_user_id, geofence_id, start_date, end_date,
        frequency_minutes, active, activity_id, now()
      from src_dedup
      on conflict on constraint tracker_assignments_unique_key
      do update set
        org_id = excluded.org_id,
        frequency_minutes = excluded.frequency_minutes,
        active = excluded.active,
        activity_id = excluded.activity_id,
        updated_at = now()
      returning (xmax = 0) as inserted_flag
    )
    select
      sum(case when inserted_flag then 1 else 0 end)::int as inserted,
      sum(case when not inserted_flag then 1 else 0 end)::int as updated
    from up;
  $q$,
    case when has_org_id then 'a.org_id::uuid' else 'null::uuid' end,
    tracker_user_expr,
    source_user_expr,
    start_date_expr,
    end_date_expr,
    active_expr,
    tracker_user_expr
  );

  execute sql_upsert into inserted, updated;

  -- Deactivate: solo considera keys activas con tenant válido
  sql_deactivate := format($q$
    with src_raw as (
      select
        a.tenant_id::uuid as tenant_id,
        %s as tracker_user_id,
        public.ensure_geofence_for_geocerca(a.geocerca_id, coalesce(a.org_id, a.tenant_id)::uuid, %s) as geofence_id,
        %s as start_date,
        %s as end_date,
        %s as active
      from public.asignaciones a
      join public.tenants t on t.id = a.tenant_id
      where a.geocerca_id is not null
        and a.tenant_id is not null
        and %s is not null
    ),
    src_keys as (
      select distinct tenant_id, tracker_user_id, geofence_id, start_date, end_date
      from src_raw
      where active
    )
    update public.tracker_assignments ta
    set active = false,
        updated_at = now()
    where ta.active = true
      and not exists (
        select 1
        from src_keys s
        where s.tenant_id = ta.tenant_id
          and s.tracker_user_id = ta.tracker_user_id
          and s.geofence_id = ta.geofence_id
          and s.start_date = ta.start_date
          and s.end_date = ta.end_date
      );
  $q$,
    tracker_user_expr,
    source_user_expr,
    start_date_expr,
    end_date_expr,
    active_expr,
    tracker_user_expr
  );

  execute sql_deactivate;
  get diagnostics deactivated = row_count;

  note := format(
    'OK (tenant FK-safe). skipped_missing_tenant=%s. Si skipped>0, corregir asignaciones.tenant_id para esas filas.',
    coalesce(skipped_missing_tenant,0)
  );
  return;
end;
$_$;


ALTER FUNCTION "public"."sync_tracker_assignments_from_asignaciones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_geocercas_set_tenant_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- En INSERT siempre setear
  if tg_op = 'INSERT' then
    new.tenant_id := public.ensure_tenant_id_for_org(new.org_id);
    return new;
  end if;

  -- En UPDATE: si cambió org_id o tenant_id viene null/inconsistente, recalcular
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id
       or new.tenant_id is null
       or new.tenant_id is distinct from public.ensure_tenant_id_for_org(new.org_id) then
      new.tenant_id := public.ensure_tenant_id_for_org(new.org_id);
    end if;
    return new;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_geocercas_set_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_organizations_ensure_owner_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  perform public.ensure_owner_in_org_members(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_organizations_ensure_owner_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_organizations_owner_change_ensure_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.owner_id is distinct from old.owner_id then
    perform public.ensure_owner_in_org_members(new.id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_organizations_owner_change_ensure_member"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "description" "text",
    "hourly_rate" numeric(12,2),
    "currency_code" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid",
    "org_id" "uuid"
);

ALTER TABLE ONLY "public"."activities" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."activities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."activities"."hourly_rate" IS 'Tarifa por hora de la actividad (módulo de costos).';



COMMENT ON COLUMN "public"."activities"."currency_code" IS 'Código de moneda ISO 4217 (ej: USD, EUR, PEN) para la tarifa horaria.';



CREATE TABLE IF NOT EXISTS "public"."activity_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tracker_user_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    CONSTRAINT "chk_aa_dates" CHECK (("start_date" <= "end_date"))
);


ALTER TABLE "public"."activity_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "usd_per_day" numeric(10,2) NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    CONSTRAINT "chk_ar_dates" CHECK ((("end_date" IS NULL) OR ("start_date" <= "end_date")))
);


ALTER TABLE "public"."activity_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "email" "text" NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."admins" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_root_owner" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL
);


ALTER TABLE "public"."app_root_owner" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_root_owners" (
    "user_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."app_root_owners" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_root_owners" IS 'Lista canónica de usuarios ROOT (superadmin) que pueden invitar admins/owners.';



COMMENT ON COLUMN "public"."app_root_owners"."user_id" IS 'auth.users.id del ROOT';



COMMENT ON COLUMN "public"."app_root_owners"."active" IS 'Si false, ese ROOT queda revocado';



CREATE TABLE IF NOT EXISTS "public"."app_root_users" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_root_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_settings" IS 'Configuraciones globales de la app (no por org).';



COMMENT ON COLUMN "public"."app_settings"."key" IS 'Clave única (ej: app_root_emails).';



COMMENT ON COLUMN "public"."app_settings"."value" IS 'JSONB: valor de configuración.';



COMMENT ON COLUMN "public"."app_settings"."updated_by" IS 'auth.uid() que actualizó.';



CREATE TABLE IF NOT EXISTS "public"."app_superadmins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."app_superadmins" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_superadmins" IS 'Usuarios root (superadmin) a nivel APP, global. Fuente universal de acceso a /admins.';



COMMENT ON COLUMN "public"."app_superadmins"."user_id" IS 'auth.users.id del root.';



COMMENT ON COLUMN "public"."app_superadmins"."created_by" IS 'auth.uid() que lo creó (si aplica).';



CREATE TABLE IF NOT EXISTS "public"."app_user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "app_user_roles_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'tracker'::"text"])))
);


ALTER TABLE "public"."app_user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asignaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "geocerca_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "start_date" "date",
    "end_date" "date",
    "tenant_id" "uuid",
    "estado" "text" DEFAULT 'activa'::"text",
    "frecuencia_envio_sec" integer,
    "personal_id" "uuid",
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "activity_id" "uuid" NOT NULL,
    "period" "daterange" GENERATED ALWAYS AS ("daterange"("start_date", COALESCE("end_date", 'infinity'::"date"), '[]'::"text")) STORED,
    "owner_id" "uuid",
    "org_id" "uuid",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "status" "text",
    "org_people_id" "uuid",
    "geofence_id" "uuid",
    "frequency_minutes" integer DEFAULT 5 NOT NULL,
    "user_id" "uuid",
    CONSTRAINT "asignaciones_fecha_check" CHECK ((("start_date" IS NULL) OR ("end_date" IS NULL) OR ("start_date" <= "end_date"))),
    CONSTRAINT "asignaciones_freq_chk" CHECK ((("frecuencia_envio_sec" IS NULL) OR ("frecuencia_envio_sec" >= 300))),
    CONSTRAINT "asignaciones_person_ref_check" CHECK ((("personal_id" IS NOT NULL) OR ("org_people_id" IS NOT NULL)))
);

ALTER TABLE ONLY "public"."asignaciones" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."asignaciones" OWNER TO "postgres";


COMMENT ON COLUMN "public"."asignaciones"."org_people_id" IS 'Referencia canónica a org_people (membresía persona↔org).';



CREATE TABLE IF NOT EXISTS "public"."asistencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "fecha" "date" DEFAULT (CURRENT_DATE AT TIME ZONE 'UTC'::"text") NOT NULL,
    "check_in" timestamp with time zone,
    "check_out" timestamp with time zone,
    "geocerca_id" "uuid",
    "lat_in" double precision,
    "lng_in" double precision,
    "lat_out" double precision,
    "lng_out" double precision,
    "status" "text" GENERATED ALWAYS AS (
CASE
    WHEN (("check_in" IS NOT NULL) AND ("check_out" IS NOT NULL)) THEN 'COMPLETADO'::"text"
    WHEN (("check_in" IS NOT NULL) AND ("check_out" IS NULL)) THEN 'EN_PROGRESO'::"text"
    ELSE 'PENDIENTE'::"text"
END) STORED,
    "notas" "text",
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asistencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "kind" "public"."attendance_kind" NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attendance_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."attendance_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."attendance_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."attendance_events_id_seq" OWNED BY "public"."attendance_events"."id";



CREATE TABLE IF NOT EXISTS "public"."attendances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "type" "text" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "accuracy_m" double precision,
    "inside_geofence" boolean NOT NULL,
    "distance_m" integer,
    "geofence_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    CONSTRAINT "attendances_type_check" CHECK (("type" = ANY (ARRAY['check_in'::"text", 'check_out'::"text"])))
);

ALTER TABLE ONLY "public"."attendances" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor" "uuid",
    "action" "text" NOT NULL,
    "entity" "text",
    "entity_id" "uuid",
    "details" "jsonb"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_signup_debug" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "stage" "text",
    "err_message" "text",
    "err_detail" "text",
    "err_hint" "text",
    "err_context" "text"
);


ALTER TABLE "public"."auth_signup_debug" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."auth_signup_debug_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."auth_signup_debug_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."auth_signup_debug_id_seq" OWNED BY "public"."auth_signup_debug"."id";



CREATE TABLE IF NOT EXISTS "public"."geocerca_geofence_map" (
    "org_id" "uuid" NOT NULL,
    "geocerca_id" "uuid" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."geocerca_geofence_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geocercas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "descripcion" "text",
    "polygon" "jsonb",
    "usuario_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT true,
    "nombre" "text",
    "geom" "jsonb",
    "created_by" "uuid",
    "id_text" "text" GENERATED ALWAYS AS (("id")::"text") STORED,
    "org_id" "uuid" NOT NULL,
    "geojson" "jsonb",
    "lat" double precision,
    "lng" double precision,
    "radius_m" integer,
    "visible" boolean DEFAULT true,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bbox" "jsonb",
    "personal_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "asignacion_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "activa" boolean DEFAULT true NOT NULL,
    "geometry" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nombre_ci" "text" GENERATED ALWAYS AS ("lower"("nombre")) STORED,
    "is_deleted" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."geocercas" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."geocercas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geocercas_tbl" (
    "id" bigint NOT NULL,
    "nombre" "text" NOT NULL,
    "geom" "public"."geometry"(Polygon,4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "geojson" "jsonb",
    "owner_id" "uuid",
    "geometria" "jsonb",
    "updated_at" timestamp with time zone,
    "vertices" "jsonb",
    "usuario_id" "uuid",
    "color" "text" DEFAULT '#3388ff'::"text",
    "coords" "jsonb"
);


ALTER TABLE "public"."geocercas_tbl" OWNER TO "postgres";


ALTER TABLE "public"."geocercas_tbl" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."geocercas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."geofence_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tracker_email" "text" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."geofence_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geofence_bridge_errors" (
    "id" bigint NOT NULL,
    "geocerca_id" "uuid" NOT NULL,
    "error_message" "text" NOT NULL,
    "geojson_type" "text",
    "geojson_head" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."geofence_bridge_errors" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."geofence_bridge_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."geofence_bridge_errors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."geofence_bridge_errors_id_seq" OWNED BY "public"."geofence_bridge_errors"."id";



CREATE TABLE IF NOT EXISTS "public"."geofence_events" (
    "id" bigint NOT NULL,
    "user_id" "text" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "geofence_events_event_check" CHECK (("event" = ANY (ARRAY['enter'::"text", 'exit'::"text"])))
);


ALTER TABLE "public"."geofence_events" OWNER TO "postgres";


ALTER TABLE "public"."geofence_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."geofence_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."geofence_members" (
    "geofence_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL
);


ALTER TABLE "public"."geofence_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geofences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "polygon_geojson" "jsonb",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "lat" double precision,
    "lng" double precision,
    "radius_m" integer DEFAULT 100 NOT NULL,
    "description" "text",
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "geojson" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geom" "public"."geometry"(MultiPolygon,4326) NOT NULL,
    "updated_by" "uuid",
    "bbox" double precision[] GENERATED ALWAYS AS (
CASE
    WHEN ("geom" IS NULL) THEN NULL::double precision[]
    ELSE ARRAY["public"."st_xmin"(("geom")::"public"."box3d"), "public"."st_ymin"(("geom")::"public"."box3d"), "public"."st_xmax"(("geom")::"public"."box3d"), "public"."st_ymax"(("geom")::"public"."box3d")]
END) STORED,
    "is_default" boolean DEFAULT false NOT NULL,
    "source_geocerca_id" "uuid",
    CONSTRAINT "geofences_shape_ck" CHECK ((("polygon_geojson" IS NOT NULL) OR (("lat" IS NOT NULL) AND ("lng" IS NOT NULL) AND ("radius_m" IS NOT NULL))))
);

ALTER TABLE ONLY "public"."geofences" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."geofences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."role_type" DEFAULT 'viewer'::"public"."role_type" NOT NULL,
    "token" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "status" "public"."invite_status" DEFAULT 'pending'::"public"."invite_status" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."role_type" DEFAULT 'viewer'::"public"."role_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_default" boolean DEFAULT false NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_billing" (
    "org_id" "uuid" NOT NULL,
    "plan_code" "text" DEFAULT 'starter'::"text" NOT NULL,
    "tracker_limit_override" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."org_billing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "org_invites_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'tracker'::"text"]))),
    CONSTRAINT "org_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text"])))
);

ALTER TABLE ONLY "public"."org_invites" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_members" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "org_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'owner'::"text", 'tracker'::"text"])))
);


ALTER TABLE "public"."org_members" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_memberships" WITH ("security_invoker"='true') AS
 SELECT "org_id",
    "user_id",
    ("role")::"text" AS "role"
   FROM "public"."memberships" "m"
  WHERE ("revoked_at" IS NULL);


ALTER VIEW "public"."org_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "vigente" boolean DEFAULT true NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "org_people_vigente_is_deleted_chk" CHECK ((NOT (("vigente" = true) AND ("is_deleted" = true))))
);


ALTER TABLE "public"."org_people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_tenant_map" (
    "org_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'geocercas'::"text" NOT NULL
);


ALTER TABLE "public"."org_tenant_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_users" (
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "org_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'tracker'::"text"])))
);


ALTER TABLE "public"."org_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "owner_id" "uuid" NOT NULL,
    "plan" "public"."plan_code" DEFAULT 'starter'::"public"."plan_code" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "slug" "text",
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active" boolean DEFAULT true,
    "logo_url" "text",
    "suspended" boolean DEFAULT false NOT NULL,
    "is_personal" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."suspended" IS 'Si true, la organización está suspendida (bloqueo de acceso por pruebas/impago/soporte). No borra datos ni usuarios.';



COMMENT ON COLUMN "public"."organizations"."is_personal" IS 'True only for the single "personal/default" organization per owner_id. Enforced by partial unique index.';



CREATE TABLE IF NOT EXISTS "public"."pending_invites" (
    "email" "text" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" "text",
    "target_org_id" "uuid",
    "personal_org_name" "text",
    "claim_code" "text",
    "status" "text",
    "expires_at" timestamp with time zone,
    "claimed_by" "uuid",
    "claimed_at" timestamp with time zone,
    CONSTRAINT "pending_invites_pending_requires_fields" CHECK ((("status" <> 'pending'::"text") OR (("email" IS NOT NULL) AND ("role" IS NOT NULL) AND ("claim_code" IS NOT NULL) AND ("expires_at" IS NOT NULL)))),
    CONSTRAINT "pending_invites_role_check" CHECK ((("role" IS NULL) OR ("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'tracker'::"text", 'viewer'::"text"])))),
    CONSTRAINT "pending_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'claimed'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."pending_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "email_norm" "text" GENERATED ALWAYS AS (NULLIF("lower"(TRIM(BOTH FROM "email")), ''::"text")) STORED,
    "telefono" "text",
    "phone_norm" "text" GENERATED ALWAYS AS (NULLIF(TRIM(BOTH FROM "telefono"), ''::"text")) STORED,
    "documento" "text",
    "documento_norm" "text" GENERATED ALWAYS AS (NULLIF("upper"(TRIM(BOTH FROM "documento")), ''::"text")) STORED,
    "nombre" "text",
    "apellido" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personas" (
    "id" bigint NOT NULL,
    "nombre" "text" NOT NULL,
    "apellido" "text",
    "email" "text"
);


ALTER TABLE "public"."personas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."personas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."personas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."personas_id_seq" OWNED BY "public"."personas"."id";



CREATE TABLE IF NOT EXISTS "public"."plan_limits" (
    "plan" "text" NOT NULL,
    "max_geocercas" integer NOT NULL,
    "max_trackers" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "code" "public"."plan_code" NOT NULL,
    "name" "text" NOT NULL,
    "geofence_limit" integer NOT NULL,
    "tracker_limit" integer NOT NULL,
    "price_month_usd" numeric NOT NULL
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posiciones" (
    "id" bigint NOT NULL,
    "tracker_id" "uuid" NOT NULL,
    "geocerca_id" "uuid",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."posiciones" OWNER TO "postgres";


ALTER TABLE "public"."posiciones" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."posiciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."position_events" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tracker_user_id" "uuid" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "inside" boolean NOT NULL,
    "source" "text" DEFAULT 'web'::"text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."position_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."position_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."position_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."position_events_id_seq" OWNED BY "public"."position_events"."id";



CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "personal_id" "uuid",
    "asignacion_id" "uuid",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "accuracy" double precision,
    "speed" double precision,
    "heading" double precision,
    "battery" integer,
    "is_mock" boolean DEFAULT false,
    "source" "text" DEFAULT 'tracker_app'::"text",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."positions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true NOT NULL,
    "role_id" "uuid",
    "org_id" "uuid",
    "role" "text",
    "tenant_id" "uuid" GENERATED ALWAYS AS ("org_id") STORED,
    "user_id" "uuid" GENERATED ALWAYS AS ("id") STORED,
    "active_tenant_id" "uuid",
    "default_org_id" "uuid",
    "current_org_id" "uuid"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles_block_log" (
    "id" bigint NOT NULL,
    "happened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "op" "text" NOT NULL,
    "new_id" "uuid",
    "new_email" "text",
    "new_role_id" "uuid",
    "new_org_id" "uuid",
    "jwt_sub" "text",
    "jwt_email" "text",
    "db_user" "text",
    "query_text" "text"
);


ALTER TABLE "public"."profiles_block_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."profiles_block_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."profiles_block_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."profiles_block_log_id_seq" OWNED BY "public"."profiles_block_log"."id";



CREATE TABLE IF NOT EXISTS "public"."role_map_membership_to_app" (
    "membership_role" "text" NOT NULL,
    "app_role" "text" NOT NULL
);


ALTER TABLE "public"."role_map_membership_to_app" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    CONSTRAINT "roles_name_check" CHECK (("char_length"("name") > 0))
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_errors" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asignacion_id" "uuid",
    "error_text" "text"
);


ALTER TABLE "public"."sync_errors" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sync_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sync_errors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sync_errors_id_seq" OWNED BY "public"."sync_errors"."id";



CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'free'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracker_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tracker_user_id" "uuid" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "period" "daterange" GENERATED ALWAYS AS ("daterange"("start_date", COALESCE("end_date", 'infinity'::"date"), '[]'::"text")) STORED,
    "frequency_minutes" integer DEFAULT 5 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_tstz" "tstzrange",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    "activity_id" "uuid",
    CONSTRAINT "chk_ta_dates" CHECK (("start_date" <= "end_date")),
    CONSTRAINT "tracker_assignments_frequency_minutes_check" CHECK (("frequency_minutes" >= 5))
);


ALTER TABLE "public"."tracker_assignments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tracker_assignments"."period_tstz" IS 'Rango activo por hora exacta (tstzrange). Usar preferentemente sobre period (daterange).';



COMMENT ON COLUMN "public"."tracker_assignments"."activity_id" IS 'Actividad asignada (FK a public.activities.id). Nullable para compatibilidad histórica.';



CREATE TABLE IF NOT EXISTS "public"."tracker_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email_norm" "text" NOT NULL,
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "used_by_user_id" "uuid",
    "is_active" boolean DEFAULT false NOT NULL,
    "email" "text",
    "role" "public"."role_type",
    "accepted_at" timestamp with time zone,
    "brevo_message_id" "text",
    "brevo_sent_at" timestamp with time zone,
    "brevo_last_status" "text",
    "brevo_last_event_at" timestamp with time zone,
    "brevo_last_response" "text",
    "brevo_last_error" "text"
);


ALTER TABLE "public"."tracker_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracker_latest" (
    "user_id" "text" NOT NULL,
    "org_id" "uuid",
    "event" "text" DEFAULT 'location_update'::"text" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "accuracy" double precision,
    "ts" timestamp with time zone NOT NULL,
    "geom" "public"."geography"(Point,4326) NOT NULL
);


ALTER TABLE "public"."tracker_latest" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracker_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tracker_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "lat" numeric(10,7) NOT NULL,
    "lng" numeric(10,7) NOT NULL,
    "accuracy" numeric(8,2),
    "speed" numeric(8,2),
    "heading" numeric(6,2),
    "battery" integer,
    "provider" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tracker_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracker_logs" (
    "id" bigint NOT NULL,
    "org_id" "uuid",
    "user_id" "text" NOT NULL,
    "event" "text" DEFAULT 'location_update'::"text" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "accuracy" double precision,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geom" "public"."geography"(Point,4326),
    "recorded_at" timestamp with time zone,
    "tenant_id" "uuid",
    "source" "text",
    "received_at" timestamp with time zone DEFAULT "now"(),
    "meta" "jsonb"
);


ALTER TABLE "public"."tracker_logs" OWNER TO "postgres";


ALTER TABLE "public"."tracker_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tracker_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tracker_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "personal_id" "uuid",
    "asignacion_id" "uuid",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "accuracy" double precision,
    "speed" double precision,
    "heading" double precision,
    "battery" integer,
    "is_mock" boolean,
    "source" "text",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tracker_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracker_positions_legacy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "geocerca_id" "uuid",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy" double precision,
    "speed" double precision,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tracker_positions_legacy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_current_org" (
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_current_org" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_geofence_state" (
    "user_id" "text" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "inside" boolean NOT NULL,
    "last_ts" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."user_geofence_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_org_settings" (
    "user_id" "uuid" NOT NULL,
    "active_org_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_org_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_organizations_role_check" CHECK (("role" = ANY (ARRAY['OWNER'::"text", 'ADMIN'::"text", 'TRACKER'::"text"])))
);


ALTER TABLE "public"."user_organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_orgs" (
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL
);


ALTER TABLE "public"."user_orgs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "telefono" "text"
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "current_org_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users_public" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "phone_e164" "text",
    "role" "public"."app_role" NOT NULL,
    "tenant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "rol" "text" DEFAULT 'tracker'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "nombre" "text",
    "phone_e164" "text",
    CONSTRAINT "usuarios_phone_e164_ck" CHECK ((("phone_e164" IS NULL) OR ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$'::"text")))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_geocercas_tracker_ui" AS
 SELECT "id",
    "org_id",
    "org_id" AS "tenant_id",
    "name",
    COALESCE("descripcion", ''::"text") AS "descripcion",
    COALESCE("active", true) AS "active",
    COALESCE("active", true) AS "activa",
    COALESCE("active", true) AS "activo",
    COALESCE("visible", true) AS "visible",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "lat",
    "lng",
    "radius_m",
    COALESCE("polygon", "geojson", "geom") AS "polygon",
    COALESCE("geom", "geojson", "polygon") AS "geom",
    "geojson",
    COALESCE("polygon", "geojson", "geom", '{}'::"jsonb") AS "geometry",
    "bbox",
    COALESCE("personal_ids", ARRAY[]::"uuid"[]) AS "personal_ids",
    COALESCE("asignacion_ids", ARRAY[]::"uuid"[]) AS "asignacion_ids",
    "usuario_id",
    "nombre",
    "id_text",
    "nombre_ci",
    "is_deleted"
   FROM "public"."geocercas" "g"
  WHERE ((COALESCE("active", true) = true) AND (COALESCE("is_deleted", false) = false));


ALTER VIEW "public"."v_geocercas_tracker_ui" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_org_people_ui" WITH ("security_invoker"='true') AS
 WITH "org" AS (
         SELECT COALESCE("public"."get_current_org_id"(), ( SELECT "p"."org_id"
                   FROM "public"."personal" "p"
                  WHERE (("p"."org_id" IS NOT NULL) AND (COALESCE("p"."is_deleted", false) = false) AND (("p"."user_id" = "auth"."uid"()) OR ("p"."owner_id" = "auth"."uid"())))
                  ORDER BY "p"."created_at" DESC
                 LIMIT 1)) AS "org_id"
        ), "src_personal" AS (
         SELECT "p"."id" AS "org_people_id",
            "p"."id" AS "person_id",
            "p"."org_id",
            "p"."nombre",
            "p"."apellido",
            "p"."email",
            COALESCE("p"."vigente", true) AS "vigente",
            COALESCE("p"."is_deleted", false) AS "is_deleted",
            "p"."deleted_at",
            "p"."created_at",
            "p"."updated_at",
            'personal'::"text" AS "source"
           FROM ("public"."personal" "p"
             JOIN "org" ON (("org"."org_id" = "p"."org_id")))
          WHERE (("org"."org_id" IS NOT NULL) AND (COALESCE("p"."is_deleted", false) = false) AND (COALESCE("p"."vigente", true) = true))
        ), "src_org_people" AS (
         SELECT "op"."id" AS "org_people_id",
            "op"."person_id",
            "op"."org_id",
            "pe"."nombre",
            "pe"."apellido",
            "pe"."email",
            COALESCE("op"."vigente", true) AS "vigente",
            COALESCE("op"."is_deleted", false) AS "is_deleted",
            "op"."deleted_at",
            "op"."created_at",
            "op"."updated_at",
            'org_people'::"text" AS "source"
           FROM (("public"."org_people" "op"
             JOIN "org" ON (("org"."org_id" = "op"."org_id")))
             JOIN "public"."people" "pe" ON (("pe"."id" = "op"."person_id")))
          WHERE (("org"."org_id" IS NOT NULL) AND (COALESCE("op"."is_deleted", false) = false) AND (COALESCE("op"."vigente", true) = true))
        ), "u" AS (
         SELECT "src_personal"."org_people_id",
            "src_personal"."person_id",
            "src_personal"."org_id",
            "src_personal"."nombre",
            "src_personal"."apellido",
            "src_personal"."email",
            "src_personal"."vigente",
            "src_personal"."is_deleted",
            "src_personal"."deleted_at",
            "src_personal"."created_at",
            "src_personal"."updated_at",
            "src_personal"."source"
           FROM "src_personal"
        UNION ALL
         SELECT "src_org_people"."org_people_id",
            "src_org_people"."person_id",
            "src_org_people"."org_id",
            "src_org_people"."nombre",
            "src_org_people"."apellido",
            "src_org_people"."email",
            "src_org_people"."vigente",
            "src_org_people"."is_deleted",
            "src_org_people"."deleted_at",
            "src_org_people"."created_at",
            "src_org_people"."updated_at",
            "src_org_people"."source"
           FROM "src_org_people"
        )
 SELECT "org_people_id" AS "id",
    "org_people_id",
    "person_id",
    "org_id",
    "nombre",
    "apellido",
    "email",
    "vigente",
    "is_deleted",
    "deleted_at",
    "created_at",
    "updated_at",
    "source",
    (TRIM(BOTH FROM ((COALESCE("nombre", ''::"text") || ' '::"text") || COALESCE("apellido", ''::"text"))) ||
        CASE
            WHEN (COALESCE("email", ''::"text") <> ''::"text") THEN (' · '::"text" || "email")
            ELSE ''::"text"
        END) AS "label"
   FROM "u";


ALTER VIEW "public"."v_org_people_ui" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_org_people_ui_all" WITH ("security_invoker"='false') AS
 WITH "src_personal" AS (
         SELECT "p"."id" AS "org_people_id",
            "p"."id" AS "person_id",
            "p"."org_id",
            "p"."nombre",
            "p"."apellido",
            "p"."email",
            COALESCE("p"."vigente", true) AS "vigente",
            COALESCE("p"."is_deleted", false) AS "is_deleted",
            "p"."deleted_at",
            "p"."created_at",
            "p"."updated_at",
            'personal'::"text" AS "source"
           FROM "public"."personal" "p"
          WHERE (("p"."org_id" IS NOT NULL) AND (COALESCE("p"."is_deleted", false) = false) AND (COALESCE("p"."vigente", true) = true))
        ), "src_org_people" AS (
         SELECT "op"."id" AS "org_people_id",
            "op"."person_id",
            "op"."org_id",
            "pe"."nombre",
            "pe"."apellido",
            "pe"."email",
            COALESCE("op"."vigente", true) AS "vigente",
            COALESCE("op"."is_deleted", false) AS "is_deleted",
            "op"."deleted_at",
            "op"."created_at",
            "op"."updated_at",
            'org_people'::"text" AS "source"
           FROM ("public"."org_people" "op"
             JOIN "public"."people" "pe" ON (("pe"."id" = "op"."person_id")))
          WHERE (("op"."org_id" IS NOT NULL) AND (COALESCE("op"."is_deleted", false) = false) AND (COALESCE("op"."vigente", true) = true))
        ), "u" AS (
         SELECT "src_personal"."org_people_id",
            "src_personal"."person_id",
            "src_personal"."org_id",
            "src_personal"."nombre",
            "src_personal"."apellido",
            "src_personal"."email",
            "src_personal"."vigente",
            "src_personal"."is_deleted",
            "src_personal"."deleted_at",
            "src_personal"."created_at",
            "src_personal"."updated_at",
            "src_personal"."source"
           FROM "src_personal"
        UNION ALL
         SELECT "src_org_people"."org_people_id",
            "src_org_people"."person_id",
            "src_org_people"."org_id",
            "src_org_people"."nombre",
            "src_org_people"."apellido",
            "src_org_people"."email",
            "src_org_people"."vigente",
            "src_org_people"."is_deleted",
            "src_org_people"."deleted_at",
            "src_org_people"."created_at",
            "src_org_people"."updated_at",
            "src_org_people"."source"
           FROM "src_org_people"
        )
 SELECT "org_people_id" AS "id",
    "org_people_id",
    "person_id",
    "org_id",
    "nombre",
    "apellido",
    "email",
    "vigente",
    "is_deleted",
    "deleted_at",
    "created_at",
    "updated_at",
    "source",
    (TRIM(BOTH FROM ((COALESCE("nombre", ''::"text") || ' '::"text") || COALESCE("apellido", ''::"text"))) ||
        CASE
            WHEN (COALESCE("email", ''::"text") <> ''::"text") THEN (' · '::"text" || "email")
            ELSE ''::"text"
        END) AS "label"
   FROM "u";


ALTER VIEW "public"."v_org_people_ui_all" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendance_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."attendance_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."auth_signup_debug" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_signup_debug_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."geofence_bridge_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."geofence_bridge_errors_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."personas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."personas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."position_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."position_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."profiles_block_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."profiles_block_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sync_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sync_errors_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_tenant_name_uniq" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."activity_assignments"
    ADD CONSTRAINT "activity_assignments_no_overlap" EXCLUDE USING "gist" ("tenant_id" WITH =, "tracker_user_id" WITH =, "daterange"("start_date", COALESCE("end_date", 'infinity'::"date"), '[]'::"text") WITH &&);



ALTER TABLE ONLY "public"."activity_assignments"
    ADD CONSTRAINT "activity_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_rates"
    ADD CONSTRAINT "activity_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."app_root_owner"
    ADD CONSTRAINT "app_root_owner_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_root_owner"
    ADD CONSTRAINT "app_root_owner_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_root_owners"
    ADD CONSTRAINT "app_root_owners_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_root_users"
    ADD CONSTRAINT "app_root_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."app_superadmins"
    ADD CONSTRAINT "app_superadmins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_personal_no_overlap" EXCLUDE USING "gist" ("org_id" WITH =, "personal_id" WITH =, "tstzrange"("start_time", "end_time", '[]'::"text") WITH &&) WHERE (("is_deleted" = false));



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_events"
    ADD CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_signup_debug"
    ADD CONSTRAINT "auth_signup_debug_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "ex_asig_no_overlap" EXCLUDE USING "gist" ("tracker_user_id" WITH =, "geofence_id" WITH =, "period" WITH &&);



ALTER TABLE ONLY "public"."geocerca_geofence_map"
    ADD CONSTRAINT "geocerca_geofence_map_geofence_id_key" UNIQUE ("geofence_id");



ALTER TABLE ONLY "public"."geocerca_geofence_map"
    ADD CONSTRAINT "geocerca_geofence_map_pkey" PRIMARY KEY ("org_id", "geocerca_id");



ALTER TABLE "public"."geocercas"
    ADD CONSTRAINT "geocercas_geom_presence_chk" CHECK ((("geojson" IS NOT NULL) OR (("lat" IS NOT NULL) AND ("lng" IS NOT NULL) AND ("radius_m" IS NOT NULL)))) NOT VALID;



ALTER TABLE ONLY "public"."geocercas"
    ADD CONSTRAINT "geocercas_org_id_nombre_ci_key" UNIQUE ("org_id", "nombre_ci");



ALTER TABLE ONLY "public"."geocercas_tbl"
    ADD CONSTRAINT "geocercas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geocercas"
    ADD CONSTRAINT "geocercas_pkey1" PRIMARY KEY ("id");



ALTER TABLE "public"."geocercas"
    ADD CONSTRAINT "geocercas_radius_positive_chk" CHECK ((("radius_m" IS NULL) OR ("radius_m" > 0))) NOT VALID;



ALTER TABLE ONLY "public"."geofence_assignments"
    ADD CONSTRAINT "geofence_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geofence_bridge_errors"
    ADD CONSTRAINT "geofence_bridge_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geofence_events"
    ADD CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geofence_members"
    ADD CONSTRAINT "geofence_members_pkey" PRIMARY KEY ("geofence_id", "user_id");



ALTER TABLE ONLY "public"."geofences"
    ADD CONSTRAINT "geofences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("org_id", "user_id");



ALTER TABLE ONLY "public"."org_billing"
    ADD CONSTRAINT "org_billing_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_unique_active" UNIQUE ("org_id", "email", "role");



ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_pkey" PRIMARY KEY ("org_id", "user_id");



ALTER TABLE ONLY "public"."org_people"
    ADD CONSTRAINT "org_people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_tenant_map"
    ADD CONSTRAINT "org_tenant_map_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_pkey" PRIMARY KEY ("user_id", "org_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_invites"
    ADD CONSTRAINT "pending_invites_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal"
    ADD CONSTRAINT "personal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal"
    ADD CONSTRAINT "personal_user_org_unique" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_limits"
    ADD CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("plan");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."posiciones"
    ADD CONSTRAINT "posiciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."position_events"
    ADD CONSTRAINT "position_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles_block_log"
    ADD CONSTRAINT "profiles_block_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_map_membership_to_app"
    ADD CONSTRAINT "role_map_membership_to_app_pkey" PRIMARY KEY ("membership_role");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."sync_errors"
    ADD CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_tracker_geofence_uniq" UNIQUE ("tracker_user_id", "geofence_id");



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_unique_key" UNIQUE ("tenant_id", "tracker_user_id", "geofence_id", "start_date", "end_date");



ALTER TABLE ONLY "public"."tracker_invites"
    ADD CONSTRAINT "tracker_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker_latest"
    ADD CONSTRAINT "tracker_latest_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."tracker_locations"
    ADD CONSTRAINT "tracker_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker_logs"
    ADD CONSTRAINT "tracker_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker_positions_legacy"
    ADD CONSTRAINT "tracker_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracker_positions"
    ADD CONSTRAINT "tracker_positions_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_current_org"
    ADD CONSTRAINT "user_current_org_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_geofence_state"
    ADD CONSTRAINT "user_geofence_state_pkey" PRIMARY KEY ("user_id", "geofence_id");



ALTER TABLE ONLY "public"."user_org_settings"
    ADD CONSTRAINT "user_org_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_org_user_unique" UNIQUE ("org_id", "user_id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_orgs"
    ADD CONSTRAINT "user_orgs_pkey" PRIMARY KEY ("user_id", "org_id");



ALTER TABLE ONLY "public"."user_orgs"
    ADD CONSTRAINT "user_orgs_user_org_unique" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users_public"
    ADD CONSTRAINT "users_public_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users_public"
    ADD CONSTRAINT "users_public_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



CREATE INDEX "activities_org_id_idx" ON "public"."activities" USING "btree" ("org_id");



CREATE INDEX "activities_tenant_id_idx" ON "public"."activities" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "app_user_roles_user_org_ux" ON "public"."app_user_roles" USING "btree" ("user_id", "org_id");



CREATE INDEX "asignaciones_geocerca_idx" ON "public"."asignaciones" USING "btree" ("geocerca_id");



CREATE INDEX "asignaciones_personal_idx" ON "public"."asignaciones" USING "btree" ("personal_id");



CREATE INDEX "asignaciones_rango_idx" ON "public"."asignaciones" USING "btree" ("start_date", "end_date");



CREATE UNIQUE INDEX "asistencias_user_fecha_uniq" ON "public"."asistencias" USING "btree" ("user_id", "fecha");



CREATE INDEX "attendances_email_created_idx" ON "public"."attendances" USING "btree" ("email", "created_at" DESC);



CREATE INDEX "attendances_geofence_created_idx" ON "public"."attendances" USING "btree" ("geofence_name", "created_at" DESC);



CREATE INDEX "attendances_inside_created_idx" ON "public"."attendances" USING "btree" ("inside_geofence", "created_at" DESC);



CREATE INDEX "geocerca_geofence_map_geofence_id_idx" ON "public"."geocerca_geofence_map" USING "btree" ("geofence_id");



CREATE INDEX "geocercas_active_idx" ON "public"."geocercas" USING "btree" ("active");



CREATE INDEX "geocercas_activo_idx" ON "public"."geocercas" USING "btree" ("activo");



CREATE INDEX "geocercas_created_at_idx" ON "public"."geocercas_tbl" USING "btree" ("created_at");



CREATE INDEX "geocercas_created_by_idx" ON "public"."geocercas_tbl" USING "btree" ("created_by");



CREATE INDEX "geocercas_created_idx" ON "public"."geocercas" USING "btree" ("created_at" DESC);



CREATE INDEX "geocercas_geojson_gin" ON "public"."geocercas_tbl" USING "gin" ("geojson");



CREATE INDEX "geocercas_geom_gin" ON "public"."geocercas" USING "gin" ("geom");



CREATE INDEX "geocercas_geom_gix" ON "public"."geocercas_tbl" USING "gist" ("geom");



CREATE INDEX "geocercas_geom_idx" ON "public"."geocercas_tbl" USING "gist" ((("geom")::"public"."geometry"));



CREATE INDEX "geocercas_gin_bbox_idx" ON "public"."geocercas" USING "gin" ("bbox");



CREATE INDEX "geocercas_gin_geojson" ON "public"."geocercas" USING "gin" ("geojson");



CREATE INDEX "geocercas_gin_geojson_idx" ON "public"."geocercas" USING "gin" ("geojson");



CREATE INDEX "geocercas_id_text_idx" ON "public"."geocercas" USING "btree" ("id_text");



CREATE UNIQUE INDEX "geocercas_id_text_key" ON "public"."geocercas" USING "btree" ("id_text") WHERE ("id_text" IS NOT NULL);



CREATE INDEX "geocercas_org_id_idx" ON "public"."geocercas" USING "btree" ("org_id");



CREATE INDEX "geocercas_org_idx" ON "public"."geocercas" USING "btree" ("org_id");



CREATE INDEX "geocercas_org_is_deleted_idx" ON "public"."geocercas" USING "btree" ("org_id", "is_deleted");



CREATE INDEX "geocercas_owner_id_idx" ON "public"."geocercas_tbl" USING "btree" ("owner_id");



CREATE INDEX "geocercas_owner_idx" ON "public"."geocercas_tbl" USING "btree" ("owner_id");



CREATE INDEX "geocercas_updated_idx" ON "public"."geocercas" USING "btree" ("updated_at" DESC);



CREATE UNIQUE INDEX "geocercas_user_nombre_unique" ON "public"."geocercas" USING "btree" ("usuario_id", "lower"("name"));



CREATE UNIQUE INDEX "geocercas_usuario_nombre_unique" ON "public"."geocercas_tbl" USING "btree" ("usuario_id", "nombre");



CREATE UNIQUE INDEX "geocercas_usuario_nombre_unique_idx" ON "public"."geocercas_tbl" USING "btree" ("usuario_id", "nombre");



CREATE INDEX "geocercas_visible_idx" ON "public"."geocercas" USING "btree" ("visible");



CREATE INDEX "geofences_geom_gix" ON "public"."geofences" USING "gist" ("geom");



CREATE INDEX "geofences_org_id_idx" ON "public"."geofences" USING "btree" ("org_id");



CREATE UNIQUE INDEX "geofences_org_name_ci_uq" ON "public"."geofences" USING "btree" ("org_id", "lower"("name"));



CREATE INDEX "idx_aa_tracker_range" ON "public"."activity_assignments" USING "btree" ("tracker_user_id", "start_date", "end_date");



CREATE INDEX "idx_activities_tenant_active" ON "public"."activities" USING "btree" ("tenant_id", "active");



CREATE INDEX "idx_app_user_roles_org" ON "public"."app_user_roles" USING "btree" ("org_id");



CREATE INDEX "idx_app_user_roles_user" ON "public"."app_user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_app_user_roles_user_id" ON "public"."app_user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_app_user_roles_user_org" ON "public"."app_user_roles" USING "btree" ("user_id", "org_id");



CREATE INDEX "idx_ar_activity_range" ON "public"."activity_rates" USING "btree" ("activity_id", "start_date", "end_date");



CREATE INDEX "idx_asig_estado" ON "public"."asignaciones" USING "btree" ("estado");



CREATE INDEX "idx_asig_geocerca" ON "public"."asignaciones" USING "btree" ("geocerca_id");



CREATE INDEX "idx_asig_tenant" ON "public"."asignaciones" USING "btree" ("tenant_id");



CREATE INDEX "idx_asignaciones_geocerca_id" ON "public"."asignaciones" USING "btree" ("geocerca_id");



CREATE INDEX "idx_asignaciones_not_deleted" ON "public"."asignaciones" USING "btree" ("is_deleted");



CREATE INDEX "idx_asignaciones_org_id" ON "public"."asignaciones" USING "btree" ("org_id");



CREATE INDEX "idx_asignaciones_owner_org" ON "public"."asignaciones" USING "btree" ("owner_id", "org_id");



CREATE INDEX "idx_asignaciones_personal_id" ON "public"."asignaciones" USING "btree" ("personal_id");



CREATE INDEX "idx_asignaciones_tenant_id" ON "public"."asignaciones" USING "btree" ("tenant_id");



CREATE INDEX "idx_assignments_geofence" ON "public"."geofence_assignments" USING "btree" ("geofence_id");



CREATE INDEX "idx_assignments_tracker" ON "public"."geofence_assignments" USING "btree" ("tracker_email");



CREATE INDEX "idx_att_created_at" ON "public"."attendances" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_att_email" ON "public"."attendances" USING "btree" ("email");



CREATE INDEX "idx_attendance_events_user_ts" ON "public"."attendance_events" USING "btree" ("user_id", "ts" DESC);



CREATE INDEX "idx_attendances_org_created" ON "public"."attendances" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_attendances_org_created_at" ON "public"."attendances" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_attendances_org_email" ON "public"."attendances" USING "btree" ("org_id", "email");



CREATE INDEX "idx_geocerca_geofence_map_geocerca" ON "public"."geocerca_geofence_map" USING "btree" ("org_id", "geocerca_id");



CREATE INDEX "idx_geocerca_geofence_map_geofence" ON "public"."geocerca_geofence_map" USING "btree" ("org_id", "geofence_id");



CREATE INDEX "idx_geofence_events_user_ts" ON "public"."geofence_events" USING "btree" ("user_id", "ts" DESC);



CREATE INDEX "idx_geofences_active" ON "public"."geofences" USING "btree" ("active");



CREATE INDEX "idx_geofences_geom" ON "public"."geofences" USING "gist" ("geom");



CREATE INDEX "idx_geofences_org" ON "public"."geofences" USING "btree" ("org_id");



CREATE INDEX "idx_memberships_tracker_vigente" ON "public"."memberships" USING "btree" ("org_id") WHERE (("role" = 'tracker'::"public"."role_type") AND ("revoked_at" IS NULL));



CREATE INDEX "idx_memberships_user_org" ON "public"."memberships" USING "btree" ("user_id", "org_id");



CREATE INDEX "idx_org_billing_plan" ON "public"."org_billing" USING "btree" ("plan_code");



CREATE INDEX "idx_org_invites_email" ON "public"."org_invites" USING "btree" ("email");



CREATE INDEX "idx_org_invites_org" ON "public"."org_invites" USING "btree" ("org_id");



CREATE INDEX "idx_org_members_user_org" ON "public"."org_members" USING "btree" ("user_id", "org_id");



CREATE INDEX "idx_org_users_org" ON "public"."org_users" USING "btree" ("org_id");



CREATE INDEX "idx_org_users_user" ON "public"."org_users" USING "btree" ("user_id");



CREATE INDEX "idx_pe_tenant_ts" ON "public"."position_events" USING "btree" ("tenant_id", "ts" DESC);



CREATE INDEX "idx_personal_fechas" ON "public"."personal" USING "btree" ("fecha_inicio", "fecha_fin");



CREATE INDEX "idx_personal_org" ON "public"."personal" USING "btree" ("org_id");



CREATE INDEX "idx_personal_org_emailnorm" ON "public"."personal" USING "btree" ("org_id", "email_norm");



CREATE INDEX "idx_personal_org_id" ON "public"."personal" USING "btree" ("org_id");



CREATE INDEX "idx_personal_user_id" ON "public"."personal" USING "btree" ("user_id");



CREATE INDEX "idx_personal_vigente" ON "public"."personal" USING "btree" ("vigente");



CREATE INDEX "idx_pos_geocerca_time" ON "public"."posiciones" USING "btree" ("geocerca_id", "timestamp");



CREATE INDEX "idx_pos_lltoearth" ON "public"."posiciones" USING "gist" ("public"."ll_to_earth"("lat", "lng"));



CREATE INDEX "idx_pos_tracker_time" ON "public"."posiciones" USING "btree" ("tracker_id", "timestamp");



CREATE INDEX "idx_positions_asignacion_time" ON "public"."positions" USING "btree" ("asignacion_id", "recorded_at" DESC);



CREATE INDEX "idx_positions_org_recorded_at" ON "public"."positions" USING "btree" ("org_id", "recorded_at" DESC);



CREATE INDEX "idx_positions_org_time" ON "public"."positions" USING "btree" ("org_id", "recorded_at" DESC);



CREATE INDEX "idx_positions_user_recorded_at" ON "public"."positions" USING "btree" ("user_id", "recorded_at" DESC);



CREATE INDEX "idx_positions_user_time" ON "public"."positions" USING "btree" ("user_id", "recorded_at" DESC);



CREATE INDEX "idx_profiles_active_tenant_id" ON "public"."profiles" USING "btree" ("active_tenant_id");



CREATE INDEX "idx_ta_org" ON "public"."tracker_assignments" USING "btree" ("org_id");



CREATE INDEX "idx_ta_org_tracker_active" ON "public"."tracker_assignments" USING "btree" ("org_id", "tracker_user_id", "active");



CREATE INDEX "idx_ta_tracker_range" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "start_date", "end_date");



CREATE INDEX "idx_tracker_assignments_activity_id" ON "public"."tracker_assignments" USING "btree" ("activity_id");



CREATE INDEX "idx_tracker_assignments_geofence" ON "public"."tracker_assignments" USING "btree" ("geofence_id");



CREATE INDEX "idx_tracker_assignments_tenant_active" ON "public"."tracker_assignments" USING "btree" ("tenant_id", "active");



CREATE INDEX "idx_tracker_assignments_tenant_tracker_active" ON "public"."tracker_assignments" USING "btree" ("tenant_id", "tracker_user_id", "active");



CREATE INDEX "idx_tracker_invites_email_active" ON "public"."tracker_invites" USING "btree" ("email") WHERE ("accepted_at" IS NULL);



CREATE INDEX "idx_tracker_locations_org_created_at" ON "public"."tracker_locations" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_tracker_locations_tracker_created_at" ON "public"."tracker_locations" USING "btree" ("tracker_id", "created_at" DESC);



CREATE INDEX "idx_tracker_logs_geom" ON "public"."tracker_logs" USING "gist" ("geom");



CREATE INDEX "idx_tracker_logs_org" ON "public"."tracker_logs" USING "btree" ("org_id");



CREATE INDEX "idx_tracker_logs_ts_desc" ON "public"."tracker_logs" USING "btree" ("ts" DESC);



CREATE INDEX "idx_tracker_logs_user" ON "public"."tracker_logs" USING "btree" ("user_id");



CREATE INDEX "idx_tracker_logs_user_ts" ON "public"."tracker_logs" USING "btree" ("user_id", "ts" DESC);



CREATE INDEX "idx_tracker_positions_user_id" ON "public"."tracker_positions_legacy" USING "btree" ("user_id");



CREATE INDEX "idx_user_organizations_org_id" ON "public"."user_organizations" USING "btree" ("org_id");



CREATE INDEX "idx_user_organizations_user_id" ON "public"."user_organizations" USING "btree" ("user_id");



CREATE INDEX "idx_user_orgs_org" ON "public"."user_orgs" USING "btree" ("org_id");



CREATE INDEX "idx_user_orgs_user" ON "public"."user_orgs" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_usuarios_phone_e164_unique" ON "public"."usuarios" USING "btree" ("phone_e164") WHERE ("phone_e164" IS NOT NULL);



CREATE INDEX "invitations_org_idx" ON "public"."invitations" USING "btree" ("org_id");



CREATE UNIQUE INDEX "invitations_pending_unique" ON "public"."invitations" USING "btree" ("org_id", "email") WHERE ("status" = 'pending'::"public"."invite_status");



CREATE UNIQUE INDEX "invitations_token_key" ON "public"."invitations" USING "btree" ("token");



CREATE INDEX "ix_pending_invites_email_lower" ON "public"."pending_invites" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "memberships_one_default_per_user" ON "public"."memberships" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE UNIQUE INDEX "memberships_one_default_per_user_active" ON "public"."memberships" USING "btree" ("user_id") WHERE (("is_default" IS TRUE) AND ("revoked_at" IS NULL));



CREATE UNIQUE INDEX "memberships_one_default_per_user_uk" ON "public"."memberships" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE UNIQUE INDEX "memberships_org_user_role_uk" ON "public"."memberships" USING "btree" ("org_id", "user_id", "role");



CREATE UNIQUE INDEX "memberships_user_org_uniq" ON "public"."memberships" USING "btree" ("user_id", "org_id");



CREATE INDEX "org_invites_email_idx" ON "public"."org_invites" USING "btree" ("lower"("email"));



CREATE INDEX "org_invites_org_id_idx" ON "public"."org_invites" USING "btree" ("org_id");



CREATE INDEX "org_invites_pending_idx" ON "public"."org_invites" USING "btree" ("org_id", "lower"("email")) WHERE (("accepted_at" IS NULL) AND ("revoked_at" IS NULL));



CREATE INDEX "org_invites_status_idx" ON "public"."org_invites" USING "btree" ("status");



CREATE UNIQUE INDEX "org_members_org_user_uniq" ON "public"."org_members" USING "btree" ("org_id", "user_id");



CREATE UNIQUE INDEX "org_people_org_person_uniq" ON "public"."org_people" USING "btree" ("org_id", "person_id");



CREATE UNIQUE INDEX "org_people_unique_active" ON "public"."org_people" USING "btree" ("org_id", "person_id") WHERE ("is_deleted" = false);



CREATE INDEX "org_tenant_map_tenant_idx" ON "public"."org_tenant_map" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "organizations_slug_key" ON "public"."organizations" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "organizations_suspended_true_idx" ON "public"."organizations" USING "btree" ("id") WHERE ("suspended" = true);



CREATE UNIQUE INDEX "people_unique_documento" ON "public"."people" USING "btree" ("documento_norm") WHERE ("documento_norm" IS NOT NULL);



CREATE UNIQUE INDEX "people_unique_email" ON "public"."people" USING "btree" ("email_norm") WHERE ("email_norm" IS NOT NULL);



CREATE UNIQUE INDEX "people_unique_phone" ON "public"."people" USING "btree" ("phone_norm") WHERE ("phone_norm" IS NOT NULL);



CREATE INDEX "personal_created_at_idx" ON "public"."personal" USING "btree" ("created_at");



CREATE INDEX "personal_email_idx" ON "public"."personal" USING "btree" ("email");



CREATE INDEX "personal_fingerprint_idx" ON "public"."personal" USING "btree" ("fingerprint");



CREATE INDEX "personal_org_email_idx" ON "public"."personal" USING "btree" ("org_id", "lower"("email"));



CREATE INDEX "personal_org_owner_tracker_idx" ON "public"."personal" USING "btree" ("org_id") WHERE (("owner_id" IS NOT NULL) AND (COALESCE("is_deleted", false) = false));



CREATE INDEX "personal_org_tracker_idx" ON "public"."personal" USING "btree" ("org_id") WHERE (("position_interval_sec" IS NOT NULL) AND ("position_interval_sec" > 0) AND (COALESCE("is_deleted", false) = false));



CREATE INDEX "personal_org_vigente_idx" ON "public"."personal" USING "btree" ("org_id", "is_deleted", "vigente");



CREATE INDEX "personal_owner_id_idx" ON "public"."personal" USING "btree" ("owner_id");



CREATE UNIQUE INDEX "personal_unique_active_email" ON "public"."personal" USING "btree" ("org_id", "email_norm") WHERE ((COALESCE("is_deleted", false) = false) AND ("email_norm" IS NOT NULL));



CREATE UNIQUE INDEX "personal_unique_active_identity" ON "public"."personal" USING "btree" ("org_id", "identity_key") WHERE ((COALESCE("is_deleted", false) = false) AND ("identity_key" IS NOT NULL));



CREATE UNIQUE INDEX "personal_unique_active_per_org" ON "public"."personal" USING "btree" ("org_id", "lower"("email"), "telefono_norm") WHERE ("is_deleted" = false);



CREATE UNIQUE INDEX "personal_unique_active_phone" ON "public"."personal" USING "btree" ("org_id", "phone_norm") WHERE ((COALESCE("is_deleted", false) = false) AND ("phone_norm" IS NOT NULL));



CREATE UNIQUE INDEX "personal_unique_fingerprint_active" ON "public"."personal" USING "btree" ("org_id", "fingerprint") WHERE (("is_deleted" = false) AND ("vigente" = true));



CREATE INDEX "profiles_created_at_desc_idx" ON "public"."profiles" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "profiles_email_unique" ON "public"."profiles" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "profiles_role_idx" ON "public"."profiles" USING "btree" ("role_id");



CREATE INDEX "tracker_assignments_active_idx" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "tenant_id", "active", "created_at" DESC);



CREATE INDEX "tracker_assignments_period_tstz_gist" ON "public"."tracker_assignments" USING "gist" ("period_tstz");



CREATE INDEX "tracker_invites_brevo_message_id_idx" ON "public"."tracker_invites" USING "btree" ("brevo_message_id");



CREATE INDEX "tracker_invites_brevo_sent_at_idx" ON "public"."tracker_invites" USING "btree" ("brevo_sent_at");



CREATE INDEX "tracker_invites_email_norm_idx" ON "public"."tracker_invites" USING "btree" ("email_norm");



CREATE INDEX "tracker_invites_expires_at_idx" ON "public"."tracker_invites" USING "btree" ("expires_at");



CREATE INDEX "tracker_invites_lookup_active_idx" ON "public"."tracker_invites" USING "btree" ("org_id", "email_norm", "is_active", "created_at" DESC);



CREATE UNIQUE INDEX "tracker_invites_one_active_per_org_email_ux" ON "public"."tracker_invites" USING "btree" ("org_id", "email_norm") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "tracker_invites_one_pending_per_org_email_ux" ON "public"."tracker_invites" USING "btree" ("org_id", "email_norm") WHERE ("used_at" IS NULL);



CREATE INDEX "tracker_invites_org_emailnorm_idx" ON "public"."tracker_invites" USING "btree" ("org_id", "email_norm");



CREATE INDEX "tracker_invites_org_id_idx" ON "public"."tracker_invites" USING "btree" ("org_id");



CREATE INDEX "tracker_logs_tenant_received_idx" ON "public"."tracker_logs" USING "btree" ("tenant_id", "received_at" DESC);



CREATE INDEX "tracker_logs_user_received_idx" ON "public"."tracker_logs" USING "btree" ("user_id", "received_at" DESC);



CREATE INDEX "tracker_positions_org_recorded_at_idx" ON "public"."tracker_positions" USING "btree" ("org_id", "recorded_at" DESC);



CREATE INDEX "tracker_positions_user_created_at_idx" ON "public"."tracker_positions_legacy" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "tracker_positions_user_recorded_at_idx" ON "public"."tracker_positions" USING "btree" ("user_id", "recorded_at" DESC);



CREATE UNIQUE INDEX "uniq_asig_person_geofence" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "geofence_id") WHERE ("end_date" IS NULL);



CREATE UNIQUE INDEX "uq_geofences_one_default_per_org" ON "public"."geofences" USING "btree" ("org_id") WHERE ("is_default" = true);



CREATE UNIQUE INDEX "uq_personal_org_documento" ON "public"."personal" USING "btree" ("org_id", "lower"("documento")) WHERE (("documento" IS NOT NULL) AND ("documento" <> ''::"text"));



CREATE UNIQUE INDEX "uq_personal_org_email_active" ON "public"."personal" USING "btree" ("org_id", "lower"("email")) WHERE ((COALESCE("is_deleted", false) = false) AND ("email" IS NOT NULL) AND ("email" <> ''::"text"));



CREATE UNIQUE INDEX "uq_tracker_assignments_unique" ON "public"."tracker_assignments" USING "btree" ("tenant_id", "tracker_user_id", "geofence_id");



CREATE INDEX "user_current_org_org_id_idx" ON "public"."user_current_org" USING "btree" ("org_id");



CREATE UNIQUE INDEX "user_current_org_user_id_uidx" ON "public"."user_current_org" USING "btree" ("user_id");



CREATE UNIQUE INDEX "ux_geofences_org_source_geocerca" ON "public"."geofences" USING "btree" ("org_id", "source_geocerca_id") WHERE ("source_geocerca_id" IS NOT NULL);



CREATE UNIQUE INDEX "ux_memberships_one_default_per_user" ON "public"."memberships" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE UNIQUE INDEX "ux_memberships_user_org_active" ON "public"."memberships" USING "btree" ("user_id", "org_id") WHERE ("revoked_at" IS NULL);



CREATE UNIQUE INDEX "ux_organizations_one_personal_per_owner" ON "public"."organizations" USING "btree" ("owner_id") WHERE ("is_personal" = true);



CREATE UNIQUE INDEX "ux_pending_invites_active" ON "public"."pending_invites" USING "btree" ("lower"("email"), "role", COALESCE("target_org_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE (("status" = 'pending'::"text") AND ("email" IS NOT NULL) AND ("role" IS NOT NULL));



CREATE UNIQUE INDEX "ux_pending_invites_claim_code_active" ON "public"."pending_invites" USING "btree" ("claim_code") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "ux_personal_org_user_active" ON "public"."personal" USING "btree" ("org_id", "user_id") WHERE ((COALESCE("is_deleted", false) = false) AND ("user_id" IS NOT NULL));



CREATE UNIQUE INDEX "ux_ta_one_active_per_tracker_org" ON "public"."tracker_assignments" USING "btree" ("org_id", "tracker_user_id") WHERE ("active" IS TRUE);



CREATE UNIQUE INDEX "ux_tracker_assignments_active" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "geofence_id") WHERE ("active" IS TRUE);



CREATE UNIQUE INDEX "ux_tracker_assignments_sync_key" ON "public"."tracker_assignments" USING "btree" ("org_id", "tracker_user_id", "geofence_id", "start_date", "end_date");



CREATE UNIQUE INDEX "ux_tracker_invites_org_email_active" ON "public"."tracker_invites" USING "btree" ("org_id", "email") WHERE ("accepted_at" IS NULL);



CREATE UNIQUE INDEX "ux_tracker_latest_user" ON "public"."tracker_latest" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "geocercas_set_tenant_id" BEFORE INSERT OR UPDATE ON "public"."geocercas" FOR EACH ROW EXECUTE FUNCTION "public"."trg_geocercas_set_tenant_id"();



CREATE OR REPLACE TRIGGER "organizations_ensure_owner_member" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_organizations_ensure_owner_member"();



CREATE OR REPLACE TRIGGER "organizations_owner_change_ensure_member" AFTER UPDATE OF "owner_id" ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_organizations_owner_change_ensure_member"();



CREATE OR REPLACE TRIGGER "trg_org_members_sync_app_user_roles" AFTER INSERT OR DELETE OR UPDATE OF "role" ON "public"."org_members" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_sync_app_user_roles"();



CREATE OR REPLACE TRIGGER "trg_org_users_sync_app_user_roles" AFTER INSERT OR DELETE OR UPDATE OF "role" ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_sync_app_user_roles"();



CREATE OR REPLACE TRIGGER "trg_user_organizations_sync_app_user_roles" AFTER INSERT OR DELETE OR UPDATE OF "role" ON "public"."user_organizations" FOR EACH ROW EXECUTE FUNCTION "public"."_trg_sync_app_user_roles"();



ALTER TABLE ONLY "public"."activity_assignments"
    ADD CONSTRAINT "activity_assignments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_assignments"
    ADD CONSTRAINT "activity_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_assignments"
    ADD CONSTRAINT "activity_assignments_tracker_user_id_fkey" FOREIGN KEY ("tracker_user_id") REFERENCES "public"."users_public"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_rates"
    ADD CONSTRAINT "activity_rates_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_rates"
    ADD CONSTRAINT "activity_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_root_users"
    ADD CONSTRAINT "app_root_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_geocerca_fk" FOREIGN KEY ("geocerca_id") REFERENCES "public"."geocercas"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_org_people_fk" FOREIGN KEY ("org_people_id") REFERENCES "public"."org_people"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_personal_fk" FOREIGN KEY ("personal_id") REFERENCES "public"."personal"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asignaciones"
    ADD CONSTRAINT "asignaciones_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."attendance_events"
    ADD CONSTRAINT "attendance_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_events"
    ADD CONSTRAINT "attendance_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "fk_user_org_organization" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geocercas"
    ADD CONSTRAINT "geocercas_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geocercas_tbl"
    ADD CONSTRAINT "geocercas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."geofence_assignments"
    ADD CONSTRAINT "geofence_assignments_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geofence_events"
    ADD CONSTRAINT "geofence_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geofence_members"
    ADD CONSTRAINT "geofence_members_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geofences"
    ADD CONSTRAINT "geofences_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geofences"
    ADD CONSTRAINT "geofences_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_billing"
    ADD CONSTRAINT "org_billing_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_members"
    ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_people"
    ADD CONSTRAINT "org_people_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_people"
    ADD CONSTRAINT "org_people_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pending_invites"
    ADD CONSTRAINT "pending_invites_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."personal"
    ADD CONSTRAINT "personal_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personal"
    ADD CONSTRAINT "personal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posiciones"
    ADD CONSTRAINT "posiciones_geocerca_fk" FOREIGN KEY ("geocerca_id") REFERENCES "public"."geocercas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posiciones"
    ADD CONSTRAINT "posiciones_tracker_fk" FOREIGN KEY ("tracker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."position_events"
    ADD CONSTRAINT "position_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."position_events"
    ADD CONSTRAINT "position_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."position_events"
    ADD CONSTRAINT "position_events_tracker_user_id_fkey" FOREIGN KEY ("tracker_user_id") REFERENCES "public"."users_public"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_current_org_id_fkey" FOREIGN KEY ("current_org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_default_org_id_fkey" FOREIGN KEY ("default_org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_geofence_fk" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracker_assignments"
    ADD CONSTRAINT "tracker_assignments_tracker_user_id_fkey" FOREIGN KEY ("tracker_user_id") REFERENCES "public"."users_public"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracker_invites"
    ADD CONSTRAINT "tracker_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracker_positions_legacy"
    ADD CONSTRAINT "tracker_positions_geocerca_id_fkey" FOREIGN KEY ("geocerca_id") REFERENCES "public"."geofences"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tracker_positions_legacy"
    ADD CONSTRAINT "tracker_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_current_org"
    ADD CONSTRAINT "user_current_org_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_geofence_state"
    ADD CONSTRAINT "user_geofence_state_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_orgs"
    ADD CONSTRAINT "user_orgs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users_public"
    ADD CONSTRAINT "users_public_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Usuarios autenticados pueden insertar" ON "public"."geocercas_tbl" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden leer" ON "public"."geocercas_tbl" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activities_delete_none" ON "public"."activities" FOR DELETE USING (false);



CREATE POLICY "activities_insert_owner_admin" ON "public"."activities" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE (("app_user_roles"."user_id" = "auth"."uid"()) AND ("app_user_roles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "activities_select_by_is_member" ON "public"."activities" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));



CREATE POLICY "activities_select_by_membership" ON "public"."activities" FOR SELECT USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



CREATE POLICY "activities_select_by_org" ON "public"."activities" FOR SELECT USING (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE ("app_user_roles"."user_id" = "auth"."uid"()))));



CREATE POLICY "activities_update_owner_admin" ON "public"."activities" FOR UPDATE USING (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE (("app_user_roles"."user_id" = "auth"."uid"()) AND ("app_user_roles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK (("org_id" IN ( SELECT "app_user_roles"."org_id"
   FROM "public"."app_user_roles"
  WHERE (("app_user_roles"."user_id" = "auth"."uid"()) AND ("app_user_roles"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "activities_write_by_membership" ON "public"."activities" USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"())))) WITH CHECK (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."activity_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_full_access" ON "public"."geofence_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text")))));



CREATE POLICY "admins_root_only_delete" ON "public"."admins" FOR DELETE TO "authenticated" USING ("public"."is_root_owner"());



CREATE POLICY "admins_root_only_select" ON "public"."admins" FOR SELECT TO "authenticated" USING ("public"."is_root_owner"());



CREATE POLICY "admins_root_only_update" ON "public"."admins" FOR UPDATE TO "authenticated" USING ("public"."is_root_owner"()) WITH CHECK ("public"."is_root_owner"());



CREATE POLICY "admins_root_only_write" ON "public"."admins" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_root_owner"());



CREATE POLICY "allow anon insert" ON "public"."geocercas_tbl" FOR INSERT WITH CHECK (true);



CREATE POLICY "allow anon read" ON "public"."geocercas_tbl" FOR SELECT USING (true);



ALTER TABLE "public"."app_root_owner" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_root_owner delete for root" ON "public"."app_root_owner" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



CREATE POLICY "app_root_owner insert for root" ON "public"."app_root_owner" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



CREATE POLICY "app_root_owner read for root" ON "public"."app_root_owner" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



CREATE POLICY "app_root_owner update for root" ON "public"."app_root_owner" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



ALTER TABLE "public"."app_root_owners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_root_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_root_users_read_own" ON "public"."app_root_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_read_authenticated" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_settings_write_service_role" ON "public"."app_settings" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."app_superadmins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_superadmins_read_authenticated" ON "public"."app_superadmins" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_superadmins_write_service_role" ON "public"."app_superadmins" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."app_user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_user_roles_select_by_org_admin" ON "public"."app_user_roles" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "app_user_roles_select_own" ON "public"."app_user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."asignaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asignaciones delete" ON "public"."asignaciones" FOR DELETE TO "authenticated" USING ("public"."is_member_of_org"("org_id"));



CREATE POLICY "asignaciones insert" ON "public"."asignaciones" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_member_of_org"("org_id"));



CREATE POLICY "asignaciones select" ON "public"."asignaciones" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));



CREATE POLICY "asignaciones update" ON "public"."asignaciones" FOR UPDATE TO "authenticated" USING ("public"."is_member_of_org"("org_id")) WITH CHECK ("public"."is_member_of_org"("org_id"));



CREATE POLICY "asignaciones_delete_owner_admin" ON "public"."asignaciones" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "asignaciones_insert_owner_admin" ON "public"."asignaciones" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "asignaciones_select_by_role" ON "public"."asignaciones" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."org_members" "om2"
  WHERE (("om2"."org_id" = "asignaciones"."org_id") AND ("om2"."user_id" = "auth"."uid"()) AND ("om2"."role" = 'tracker'::"text"))))));



CREATE POLICY "asignaciones_update_owner_admin" ON "public"."asignaciones" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."org_members" "om"
  WHERE (("om"."org_id" = "asignaciones"."org_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."asistencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asistencias_insert_self" ON "public"."asistencias" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "asistencias_select_self" ON "public"."asistencias" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "asistencias_update_self" ON "public"."asistencias" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."attendance_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_events delete own" ON "public"."attendance_events" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "attendance_events insert own" ON "public"."attendance_events" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "attendance_events select own" ON "public"."attendance_events" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "attendance_events update own" ON "public"."attendance_events" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendances_insert_auth" ON "public"."attendances" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "attendances_read_auth" ON "public"."attendances" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth can delete" ON "public"."geocercas_tbl" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "auth can insert" ON "public"."geocercas_tbl" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "auth can select" ON "public"."geocercas_tbl" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth can update" ON "public"."geocercas_tbl" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."auth_signup_debug" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete own geocercas" ON "public"."geocercas_tbl" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "dev_all_assignments" ON "public"."geofence_assignments" USING (true) WITH CHECK (true);



ALTER TABLE "public"."geocerca_geofence_map" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "geocerca_geofence_map read" ON "public"."geocerca_geofence_map" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."geocercas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "geocercas_crud_auth" ON "public"."geocercas_tbl" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = COALESCE("created_by", "auth"."uid"())));



CREATE POLICY "geocercas_delete" ON "public"."geocercas" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geocercas"."org_id")))));



CREATE POLICY "geocercas_delete_own" ON "public"."geocercas_tbl" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "geocercas_delete_owner" ON "public"."geocercas_tbl" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "geocercas_insert_by_org" ON "public"."geocercas" FOR INSERT TO "authenticated" WITH CHECK (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



CREATE POLICY "geocercas_insert_own" ON "public"."geocercas_tbl" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "geocercas_insert_self" ON "public"."geocercas_tbl" FOR INSERT TO "authenticated" WITH CHECK ((COALESCE("owner_id", "auth"."uid"()) = "auth"."uid"()));



CREATE POLICY "geocercas_mod" ON "public"."geocercas" USING ((("org_id" IS NOT NULL) AND ("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))))) WITH CHECK ((("org_id" IS NOT NULL) AND ("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "geocercas_select" ON "public"."geocercas" FOR SELECT USING ((("org_id" IS NOT NULL) AND ("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "geocercas_select_assigned_trackers" ON "public"."geocercas" FOR SELECT TO "authenticated" USING ("public"."is_tracker_assigned_to_geofence"("org_id", "id"));



CREATE POLICY "geocercas_select_auth" ON "public"."geocercas_tbl" FOR SELECT USING (("auth"."uid"() = "created_by"));



CREATE POLICY "geocercas_select_by_is_member" ON "public"."geocercas" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));



CREATE POLICY "geocercas_select_by_org" ON "public"."geocercas" FOR SELECT TO "authenticated" USING (("org_id" IN ( SELECT "m"."org_id"
   FROM "public"."memberships" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))));



CREATE POLICY "geocercas_select_org_members" ON "public"."geocercas" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("org_id"));



CREATE POLICY "geocercas_select_own" ON "public"."geocercas_tbl" FOR SELECT USING (("created_by" = "auth"."uid"()));



CREATE POLICY "geocercas_select_owner" ON "public"."geocercas_tbl" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."geocercas_tbl" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "geocercas_update" ON "public"."geocercas" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geocercas"."org_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geocercas"."org_id")))));



CREATE POLICY "geocercas_update_own" ON "public"."geocercas_tbl" FOR UPDATE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "geocercas_update_owner" ON "public"."geocercas_tbl" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."geofence_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geofence_bridge_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geofence_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geofence_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geofences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "geofences_delete" ON "public"."geofences" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));



CREATE POLICY "geofences_delete_admin" ON "public"."geofences" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "geofences_insert" ON "public"."geofences" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));



CREATE POLICY "geofences_insert_admin" ON "public"."geofences" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "geofences_insert_in_org" ON "public"."geofences" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_user_roles" "r"
  WHERE (("r"."org_id" = "geofences"."org_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "geofences_select" ON "public"."geofences" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));



CREATE POLICY "geofences_select_admin" ON "public"."geofences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "geofences_select_in_org" ON "public"."geofences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_user_roles" "r"
  WHERE (("r"."org_id" = "geofences"."org_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "geofences_select_tracker_assigned" ON "public"."geofences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tracker_assignments" "ta"
  WHERE (("ta"."org_id" = "geofences"."org_id") AND ("ta"."geofence_id" = "geofences"."id") AND ("ta"."tracker_user_id" = "auth"."uid"()) AND (COALESCE("ta"."active", true) = true) AND ((CURRENT_DATE >= "ta"."start_date") AND (CURRENT_DATE <= "ta"."end_date"))))));



CREATE POLICY "geofences_update" ON "public"."geofences" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "geofences"."org_id") AND ("m"."revoked_at" IS NULL)))));



CREATE POLICY "geofences_update_admin" ON "public"."geofences" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((("org_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "geofences"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("lower"(("m"."role")::"text") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "insert own geocercas" ON "public"."geocercas_tbl" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "insert_anyone" ON "public"."attendances" FOR INSERT WITH CHECK (true);



CREATE POLICY "insert_anyone_dev" ON "public"."attendances" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "insert_authenticated" ON "public"."attendances" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert_own_location" ON "public"."tracker_locations" FOR INSERT TO "authenticated" WITH CHECK (("tracker_id" = "auth"."uid"()));



CREATE POLICY "inv: managers modify" ON "public"."invitations" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "invitations"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"public"."role_type", 'admin'::"public"."role_type"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "invitations"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"public"."role_type", 'admin'::"public"."role_type"]))))));



CREATE POLICY "inv: managers select" ON "public"."invitations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "invitations"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"public"."role_type", 'admin'::"public"."role_type"]))))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "me update my phone" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "me update my phone - upd" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_delete_admin" ON "public"."memberships" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "memberships_insert_admin" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" IS NOT NULL) AND "public"."is_org_admin"("org_id")));



CREATE POLICY "memberships_insert_self" ON "public"."memberships" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("org_id" IS NOT NULL)));



CREATE POLICY "memberships_select_admin" ON "public"."memberships" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "memberships_select_own" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "memberships_update_admin" ON "public"."memberships" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id")) WITH CHECK ("public"."is_org_admin"("org_id"));



CREATE POLICY "memberships_update_own" ON "public"."memberships" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "org admins can read org tracker positions" ON "public"."tracker_positions_legacy" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."personal" "p"
  WHERE (("p"."user_id" = "tracker_positions_legacy"."user_id") AND (COALESCE("p"."is_deleted", false) = false) AND (COALESCE("p"."activo_bool", true) = true) AND (COALESCE("p"."vigente", true) = true) AND "public"."is_org_admin"("p"."org_id", "auth"."uid"())))));



ALTER TABLE "public"."org_billing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_billing delete admin" ON "public"."org_billing" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "org_billing insert admin" ON "public"."org_billing" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("org_id"));



CREATE POLICY "org_billing read admin" ON "public"."org_billing" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "org_billing update admin" ON "public"."org_billing" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id")) WITH CHECK ("public"."is_org_admin"("org_id"));



ALTER TABLE "public"."org_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_invites_root_only_delete" ON "public"."org_invites" FOR DELETE TO "authenticated" USING ("public"."is_root_owner"());



CREATE POLICY "org_invites_root_only_select" ON "public"."org_invites" FOR SELECT TO "authenticated" USING ("public"."is_root_owner"());



CREATE POLICY "org_invites_root_only_update" ON "public"."org_invites" FOR UPDATE TO "authenticated" USING ("public"."is_root_owner"()) WITH CHECK ("public"."is_root_owner"());



CREATE POLICY "org_invites_root_only_write" ON "public"."org_invites" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_root_owner"());



ALTER TABLE "public"."org_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_members_select_self" ON "public"."org_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."org_people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_people delete by org admin" ON "public"."org_people" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "org_people insert by org admin" ON "public"."org_people" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("org_id"));



CREATE POLICY "org_people read by org member" ON "public"."org_people" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "org_people"."org_id") AND ("m"."revoked_at" IS NULL)))));



CREATE POLICY "org_people update by org admin" ON "public"."org_people" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id")) WITH CHECK ("public"."is_org_admin"("org_id"));



ALTER TABLE "public"."org_tenant_map" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_tenant_map read" ON "public"."org_tenant_map" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."org_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pending_invites read" ON "public"."pending_invites" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_owner"("auth"."uid"()));



CREATE POLICY "pending_invites write" ON "public"."pending_invites" TO "authenticated" USING ("public"."is_admin_or_owner"("auth"."uid"())) WITH CHECK ("public"."is_admin_or_owner"("auth"."uid"()));



CREATE POLICY "pending_invites_insert_root" ON "public"."pending_invites" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "r"
  WHERE (("r"."user_id" = "auth"."uid"()) AND ("r"."active" = true)))));



CREATE POLICY "pending_invites_select_own_email" ON "public"."pending_invites" FOR SELECT TO "authenticated" USING ((("email" IS NOT NULL) AND ("lower"("email") = "lower"("auth"."email"()))));



CREATE POLICY "pending_invites_select_root" ON "public"."pending_invites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "r"
  WHERE (("r"."user_id" = "auth"."uid"()) AND ("r"."active" = true)))));



ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "people delete by org admin" ON "public"."people" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."org_people" "op"
  WHERE (("op"."person_id" = "people"."id") AND "public"."is_org_admin"("op"."org_id") AND (COALESCE("op"."is_deleted", false) = false)))));



CREATE POLICY "people insert by org admin" ON "public"."people" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."revoked_at" IS NULL) AND "public"."is_org_admin"("m"."org_id")))));



CREATE POLICY "people read by org membership" ON "public"."people" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."org_people" "op"
     JOIN "public"."memberships" "m" ON ((("m"."org_id" = "op"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."revoked_at" IS NULL))))
  WHERE (("op"."person_id" = "people"."id") AND (COALESCE("op"."is_deleted", false) = false)))));



CREATE POLICY "people update by org admin" ON "public"."people" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."org_people" "op"
  WHERE (("op"."person_id" = "people"."id") AND "public"."is_org_admin"("op"."org_id") AND (COALESCE("op"."is_deleted", false) = false))))) WITH CHECK (true);



ALTER TABLE "public"."personal" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_delete_admin" ON "public"."personal" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"()));



CREATE POLICY "personal_insert_admin" ON "public"."personal" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("org_id", "auth"."uid"()));



CREATE POLICY "personal_select_admins" ON "public"."personal" FOR SELECT TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"()));



CREATE POLICY "personal_select_by_is_member" ON "public"."personal" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));



CREATE POLICY "personal_select_members" ON "public"."personal" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."org_id" = "personal"."org_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "personal_update_admin" ON "public"."personal" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"())) WITH CHECK ("public"."is_org_admin"("org_id", "auth"."uid"()));



ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personas_select_auth" ON "public"."personas" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."plan_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_limits read" ON "public"."plan_limits" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans read" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pos_insert_self" ON "public"."posiciones" FOR INSERT TO "authenticated" WITH CHECK (("tracker_id" = "auth"."uid"()));



CREATE POLICY "pos_select_self" ON "public"."posiciones" FOR SELECT TO "authenticated" USING (("tracker_id" = "auth"."uid"()));



ALTER TABLE "public"."posiciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."position_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "positions_delete_admin_org" ON "public"."positions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "positions_insert_self" ON "public"."positions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "positions_insert_tracker" ON "public"."positions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['tracker'::"text", 'admin'::"text", 'owner'::"text"]))))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "positions_select_admin_org" ON "public"."positions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "positions_select_authenticated" ON "public"."positions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "positions_select_tracker_self" ON "public"."positions" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = 'tracker'::"text"))))));



CREATE POLICY "positions_update_admin_org" ON "public"."positions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "auth"."uid"()) AND ("uo"."org_id" = "positions"."org_id") AND ("uo"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles_block_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_select_same_org" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("org_id" IN ( SELECT "user_orgs"."org_id"
   FROM "public"."user_orgs"
  WHERE ("user_orgs"."user_id" = "auth"."uid"())))));



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_self_read" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "read all logs" ON "public"."tracker_logs" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "read geofence events all" ON "public"."geofence_events" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "read latest by org" ON "public"."tracker_latest" FOR SELECT TO "authenticated" USING ((("org_id")::"text" = COALESCE((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'org_id'::"text"), ''::"text")));



CREATE POLICY "read latest positions" ON "public"."tracker_latest" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "read own positions" ON "public"."tracker_positions_legacy" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "read state all" ON "public"."user_geofence_state" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "read_all_attendances" ON "public"."attendances" FOR SELECT USING (true);



ALTER TABLE "public"."role_map_membership_to_app" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_map_membership_to_app read" ON "public"."role_map_membership_to_app" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select_all" ON "public"."roles" FOR SELECT USING (true);



CREATE POLICY "root_owners delete for root" ON "public"."app_root_owners" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



CREATE POLICY "root_owners insert for root" ON "public"."app_root_owners" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



CREATE POLICY "root_owners read for root" ON "public"."app_root_owners" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



CREATE POLICY "root_owners update for root" ON "public"."app_root_owners" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_root_owners" "aro"
  WHERE (("aro"."user_id" = "auth"."uid"()) AND ("aro"."active" = true)))));



CREATE POLICY "select own geocercas" ON "public"."geocercas_tbl" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "select_anyone_dev" ON "public"."attendances" FOR SELECT TO "anon" USING (true);



CREATE POLICY "select_own_locations" ON "public"."tracker_locations" FOR SELECT TO "authenticated" USING (("tracker_id" = "auth"."uid"()));



ALTER TABLE "public"."sync_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tp_insert_own" ON "public"."tracker_positions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "tp_select_org_members" ON "public"."tracker_positions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."org_id" = "tracker_positions"."org_id")))));



CREATE POLICY "tp_select_own" ON "public"."tracker_positions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."tracker_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tracker_assignments_delete_admin" ON "public"."tracker_assignments" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"()));



CREATE POLICY "tracker_assignments_insert_admin" ON "public"."tracker_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("org_id", "auth"."uid"()));



CREATE POLICY "tracker_assignments_select_member" ON "public"."tracker_assignments" FOR SELECT TO "authenticated" USING ("public"."is_member_of_org"("org_id"));



CREATE POLICY "tracker_assignments_update_admin" ON "public"."tracker_assignments" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id", "auth"."uid"())) WITH CHECK ("public"."is_org_admin"("org_id", "auth"."uid"()));



ALTER TABLE "public"."tracker_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tracker_invites delete admin" ON "public"."tracker_invites" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "tracker_invites insert admin" ON "public"."tracker_invites" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("org_id"));



CREATE POLICY "tracker_invites read admin_or_actor" ON "public"."tracker_invites" FOR SELECT TO "authenticated" USING (("public"."is_org_admin"("org_id") OR ("created_by_user_id" = "auth"."uid"()) OR ("used_by_user_id" = "auth"."uid"())));



CREATE POLICY "tracker_invites update admin" ON "public"."tracker_invites" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("org_id")) WITH CHECK ("public"."is_org_admin"("org_id"));



ALTER TABLE "public"."tracker_latest" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracker_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracker_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracker_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracker_positions_legacy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trackers insert their own position" ON "public"."tracker_positions_legacy" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "uco_insert_own" ON "public"."user_current_org" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "uco_select_own" ON "public"."user_current_org" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "uco_update_own" ON "public"."user_current_org" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "uo_delete_owner_only" ON "public"."user_orgs" FOR DELETE TO "authenticated" USING (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"()))));



CREATE POLICY "uo_insert_owner_only" ON "public"."user_orgs" FOR INSERT TO "authenticated" WITH CHECK (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"()))));



CREATE POLICY "uo_select_self_or_owned" ON "public"."user_orgs" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"())))));



CREATE POLICY "uo_update_owner_only" ON "public"."user_orgs" FOR UPDATE TO "authenticated" USING (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"())))) WITH CHECK (("org_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."owner_id" = "auth"."uid"()))));



CREATE POLICY "up_sel_self" ON "public"."users_public" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "update own geocercas" ON "public"."geocercas_tbl" FOR UPDATE USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "update_own_locations" ON "public"."tracker_locations" FOR UPDATE TO "authenticated" USING (("tracker_id" = "auth"."uid"())) WITH CHECK (("tracker_id" = "auth"."uid"()));



CREATE POLICY "user can insert own positions" ON "public"."tracker_positions_legacy" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user can read own org settings" ON "public"."user_org_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user can see own positions" ON "public"."tracker_positions_legacy" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user can update own org settings" ON "public"."user_org_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user can upsert own org settings" ON "public"."user_org_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_current_org" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_geofence_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_org_select_self" ON "public"."user_organizations" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_org_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_orgs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_orgs_insert_self" ON "public"."user_organizations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles read own" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_roles write only admin/owner" ON "public"."user_roles" TO "authenticated" USING ("public"."is_admin_or_owner"("auth"."uid"())) WITH CHECK ("public"."is_admin_or_owner"("auth"."uid"()));



ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_settings_self" ON "public"."user_settings" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."users_public" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuarios_insert_self" ON "public"."usuarios" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "usuarios_select_self" ON "public"."usuarios" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "usuarios_update_self" ON "public"."usuarios" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_out"("public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_out"("public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_out"("public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_out"("public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_recv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_recv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_recv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_recv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_send"("public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_send"("public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_send"("public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_send"("public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("path") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("point") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."_app_user_roles_delete"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_app_user_roles_delete"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_app_user_roles_delete"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_app_user_roles_upsert"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_app_user_roles_upsert"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_app_user_roles_upsert"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_col_exists"("p_table" "regclass", "p_col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_col_exists"("p_table" "regclass", "p_col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_col_exists"("p_table" "regclass", "p_col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_col_exists"("p_table" "text", "p_col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_col_exists"("p_table" "text", "p_col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_col_exists"("p_table" "text", "p_col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_email_norm"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_email_norm"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_email_norm"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_geojson_to_multipolygon_4326"("p_geojson" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_geojson_to_multipolygon_4326"("p_geojson" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_geojson_to_multipolygon_4326"("p_geojson" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_geom_from_geometry"("_geom_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_geom_from_geometry"("_geom_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_geom_from_geometry"("_geom_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_root_claim"() TO "anon";
GRANT ALL ON FUNCTION "public"."_is_root_claim"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_root_claim"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_normalize_app_role"("p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_normalize_app_role"("p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_normalize_app_role"("p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_normalize_role_for_app_user_roles"("p_user" "uuid", "p_org" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_normalize_role_for_app_user_roles"("p_user" "uuid", "p_org" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_normalize_role_for_app_user_roles"("p_user" "uuid", "p_org" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_org_members_user_col"() TO "anon";
GRANT ALL ON FUNCTION "public"."_org_members_user_col"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_org_members_user_col"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_org_parent_table_of_org_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."_org_parent_table_of_org_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_org_parent_table_of_org_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_organizations_plan_default_label"() TO "anon";
GRANT ALL ON FUNCTION "public"."_organizations_plan_default_label"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_organizations_plan_default_label"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_organizations_plan_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."_organizations_plan_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_organizations_plan_type"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_pick_membership_role_label"("p_desired" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_pick_membership_role_label"("p_desired" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pick_membership_role_label"("p_desired" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_pick_org_table"() TO "anon";
GRANT ALL ON FUNCTION "public"."_pick_org_table"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pick_org_table"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_resolve_tenant_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."_resolve_tenant_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_resolve_tenant_for_current_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_trg_sync_app_user_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."_trg_sync_app_user_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_trg_sync_app_user_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_user_has_org"("p_user" "uuid", "p_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_user_has_org"("p_user" "uuid", "p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_user_has_org"("p_user" "uuid", "p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activities_create"("p_name" "text", "p_description" "text", "p_active" boolean, "p_currency_code" "text", "p_hourly_rate" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."activities_create"("p_name" "text", "p_description" "text", "p_active" boolean, "p_currency_code" "text", "p_hourly_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activities_create"("p_name" "text", "p_description" "text", "p_active" boolean, "p_currency_code" "text", "p_hourly_rate" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."activities_delete"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activities_delete"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activities_delete"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activities_set_active"("p_id" "uuid", "p_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."activities_set_active"("p_id" "uuid", "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activities_set_active"("p_id" "uuid", "p_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."activities_sync_org_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."activities_sync_org_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."activities_sync_org_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."activities_update"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_currency_code" "text", "p_hourly_rate" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."activities_update"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_currency_code" "text", "p_hourly_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activities_update"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_currency_code" "text", "p_hourly_rate" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."addauth"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_assign_or_create_org"("p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_assign_or_create_org"("p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_assign_or_create_org"("p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_assign_role_org"("p_email" "text", "p_role_slug" "text", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_assign_role_org"("p_email" "text", "p_role_slug" "text", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_assign_role_org"("p_email" "text", "p_role_slug" "text", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_assign_role_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_assign_role_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_assign_role_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."app_admin_mode"() TO "anon";
GRANT ALL ON FUNCTION "public"."app_admin_mode"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_admin_mode"() TO "service_role";



GRANT ALL ON FUNCTION "public"."app_current_tenant_id"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."app_current_tenant_id"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_current_tenant_id"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."app_install_rls"("p_table" "regclass", "p_org_col" "text", "p_owner_col" "text", "p_require_owner_write" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."app_install_rls"("p_table" "regclass", "p_org_col" "text", "p_owner_col" "text", "p_require_owner_write" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_install_rls"("p_table" "regclass", "p_org_col" "text", "p_owner_col" "text", "p_require_owner_write" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."app_is_admin"("p_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."app_is_admin"("p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_is_admin"("p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."app_is_member"("p_org" "uuid", "p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."app_is_member"("p_org" "uuid", "p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_is_member"("p_org" "uuid", "p_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."app_jwt_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."app_jwt_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_jwt_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."app_jwt_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."app_jwt_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_jwt_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."app_set_tenant"("p_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."app_set_tenant"("p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_set_tenant"("p_tenant" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_memberships"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_memberships"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_memberships"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_organizations"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_organizations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_organizations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bootstrap_session_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_session_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_session_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bootstrap_tracker_assignment_current_user"("p_frequency_minutes" integer, "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_tracker_assignment_current_user"("p_frequency_minutes" integer, "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_tracker_assignment_current_user"("p_frequency_minutes" integer, "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."bootstrap_user_after_login"() TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_user_after_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_user_after_login"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bootstrap_user_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_user_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_user_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_user_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bootstrap_user_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_user_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_user_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bootstrap_user_membership_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_user_membership_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_user_membership_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_invitation"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_invitation"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_invitation"("p_invite_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_pending_tracker_invite"("p_org_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_pending_tracker_invite"("p_org_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_pending_tracker_invite"("p_org_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_pending_tracker_invite"("p_org_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_pending_invite"("p_claim_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_pending_invite"("p_claim_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_pending_invite"("p_claim_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_effective_app_role"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_effective_app_role"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_effective_app_role"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."copy_tracker_log_to_positions"() TO "anon";
GRANT ALL ON FUNCTION "public"."copy_tracker_log_to_positions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."copy_tracker_log_to_positions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."count_active_trackers"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_active_trackers"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_active_trackers"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_frecuencia" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_frecuencia" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_frecuencia" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone, "p_frecuencia_min" integer, "p_nombre" "text", "p_telefono" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone, "p_frecuencia_min" integer, "p_nombre" "text", "p_telefono" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_asignacion"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_inicio" timestamp with time zone, "p_fin" timestamp with time zone, "p_frecuencia_min" integer, "p_nombre" "text", "p_telefono" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_geocerca"("_nombre" "text", "_geometry" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_geocerca"("_nombre" "text", "_geometry" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_geocerca"("_nombre" "text", "_geometry" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_organization_for_current_user"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_organization_for_current_user"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization_for_current_user"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_personal_org_and_assign_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_personal_org_and_assign_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_personal_org_and_assign_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cube"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."cube"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube"(double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube"(double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."cube"(double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube"(double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."cube"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."cube"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube"("public"."cube", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_cmp"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_cmp"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_cmp"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_cmp"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_contained"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_contained"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_contained"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_contained"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_contains"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_contains"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_contains"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_contains"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_coord"("public"."cube", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_coord"("public"."cube", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cube_coord"("public"."cube", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_coord"("public"."cube", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_coord_llur"("public"."cube", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_coord_llur"("public"."cube", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cube_coord_llur"("public"."cube", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_coord_llur"("public"."cube", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_dim"("public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_dim"("public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_dim"("public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_dim"("public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_distance"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_distance"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_distance"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_distance"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_enlarge"("public"."cube", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_enlarge"("public"."cube", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cube_enlarge"("public"."cube", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_enlarge"("public"."cube", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_eq"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_eq"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_eq"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_eq"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_ge"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_ge"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_ge"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_ge"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_gt"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_gt"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_gt"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_gt"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_inter"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_inter"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_inter"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_inter"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_is_point"("public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_is_point"("public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_is_point"("public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_is_point"("public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_le"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_le"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_le"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_le"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_ll_coord"("public"."cube", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_ll_coord"("public"."cube", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cube_ll_coord"("public"."cube", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_ll_coord"("public"."cube", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_lt"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_lt"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_lt"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_lt"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_ne"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_ne"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_ne"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_ne"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_overlap"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_overlap"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_overlap"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_overlap"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_size"("public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_size"("public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_size"("public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_size"("public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_subset"("public"."cube", integer[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_subset"("public"."cube", integer[]) TO "anon";
GRANT ALL ON FUNCTION "public"."cube_subset"("public"."cube", integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_subset"("public"."cube", integer[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_union"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_union"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."cube_union"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_union"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."cube_ur_coord"("public"."cube", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."cube_ur_coord"("public"."cube", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cube_ur_coord"("public"."cube", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cube_ur_coord"("public"."cube", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_geocerca_id_for_tracker"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."current_geocerca_id_for_tracker"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_geocerca_id_for_tracker"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_org_id_from_memberships"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_id_from_memberships"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id_from_memberships"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_org_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_org_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_org_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_all_geocercas_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_all_geocercas_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_all_geocercas_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_geofence_hard"("p_geofence_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_geofence_hard"("p_geofence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_geofence_hard"("p_geofence_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_full"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_full"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_full"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."disable_assignments_when_geofence_inactive"() TO "anon";
GRANT ALL ON FUNCTION "public"."disable_assignments_when_geofence_inactive"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_assignments_when_geofence_inactive"() TO "service_role";



GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."distance_chebyshev"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."distance_chebyshev"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."distance_chebyshev"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."distance_chebyshev"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."distance_taxicab"("public"."cube", "public"."cube") TO "postgres";
GRANT ALL ON FUNCTION "public"."distance_taxicab"("public"."cube", "public"."cube") TO "anon";
GRANT ALL ON FUNCTION "public"."distance_taxicab"("public"."cube", "public"."cube") TO "authenticated";
GRANT ALL ON FUNCTION "public"."distance_taxicab"("public"."cube", "public"."cube") TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."earth"() TO "postgres";
GRANT ALL ON FUNCTION "public"."earth"() TO "anon";
GRANT ALL ON FUNCTION "public"."earth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."earth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gc_to_sec"(double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."gc_to_sec"(double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."gc_to_sec"(double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gc_to_sec"(double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."earth_box"("public"."earth", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."earth_box"("public"."earth", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."earth_box"("public"."earth", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."earth_box"("public"."earth", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."sec_to_gc"(double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."sec_to_gc"(double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."sec_to_gc"(double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sec_to_gc"(double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."earth_distance"("public"."earth", "public"."earth") TO "postgres";
GRANT ALL ON FUNCTION "public"."earth_distance"("public"."earth", "public"."earth") TO "anon";
GRANT ALL ON FUNCTION "public"."earth_distance"("public"."earth", "public"."earth") TO "authenticated";
GRANT ALL ON FUNCTION "public"."earth_distance"("public"."earth", "public"."earth") TO "service_role";



GRANT ALL ON FUNCTION "public"."effective_tracker_limit"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."effective_tracker_limit"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."effective_tracker_limit"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_geocercas_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_core"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_core"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_core"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_core_orig"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_core_orig"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_core_orig"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_impl"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_impl"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_geocercas_total_limit_impl"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_geofence_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_geofence_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_geofence_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_org_eq_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_org_eq_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_org_eq_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_org_people_tracker_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_org_people_tracker_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_org_people_tracker_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_owner_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_owner_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_owner_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_personal_tracker_limit_final"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_personal_tracker_limit_final"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_personal_tracker_limit_final"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_admin_invites"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_admin_invites"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_admin_invites"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_admin_per_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_admin_per_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_admin_per_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_active_org_for_user"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_active_org_for_user"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_active_org_for_user"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_admin_bootstrap"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_admin_bootstrap"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_admin_bootstrap"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_current_org_for_user"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_current_org_for_user"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_current_org_for_user"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_default_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_default_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_default_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_default_org_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_default_org_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_default_org_for_current_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_default_org_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_default_org_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_default_org_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid", "p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid", "p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_geofence_for_geocerca"("p_geocerca_id" "uuid", "p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_geofence_from_geocerca"("p_geocerca_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_geofence_from_geocerca"("p_geocerca_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_geofence_from_geocerca"("p_geocerca_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_membership_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_membership_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_membership_for_current_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_membership_for_current_user"("p_org" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_membership_for_current_user"("p_org" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_membership_for_current_user"("p_org" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_membership_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_membership_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_membership_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_core"("p_user_id" "uuid", "p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_core"("p_user_id" "uuid", "p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_core"("p_user_id" "uuid", "p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_org_for_admin_profiles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_profiles"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_profiles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_org_for_admin_user_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_admin_user_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_org_for_current_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_org_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_current_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_org_for_new_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_org_for_new_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_new_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_new_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_org_for_owner_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_org_for_owner_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_owner_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_owner_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_org_for_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_org_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_owner_in_org_members"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_owner_in_org_members"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_owner_in_org_members"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_owner_org_for_user"("p_user_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_owner_org_for_user"("p_user_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_owner_org_for_user"("p_user_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_owner_org_for_user"("p_user_id" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_personal_for_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_nombre" "text", "p_telefono" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_personal_for_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_nombre" "text", "p_telefono" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_personal_for_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_nombre" "text", "p_telefono" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_personal_for_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid", "p_nombre" "text", "p_telefono" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_personal_for_user"("p_user_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_personal_for_user"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_personal_for_user"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_personal_for_user"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_personal_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_personal_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_personal_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_personal_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_personal_org_for"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_personal_org_for"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_personal_org_for"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_personal_org_for"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_personal_org_for_user"("p_user_id" "uuid", "p_org_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_personal_org_for_user"("p_user_id" "uuid", "p_org_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_personal_org_for_user"("p_user_id" "uuid", "p_org_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_personal_org_for_user"("p_user_id" "uuid", "p_org_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_profile"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_profile"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_profile"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_single_default_membership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_single_default_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_default_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_default_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_system_user_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_system_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_system_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_system_user_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_tenant_for_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_tenant_for_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_tenant_for_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_tenant_for_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_tenant_id_for_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_tenant_id_for_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_tenant_id_for_org"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_tracker_membership"("p_email" "text", "p_org_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_tracker_membership"("p_email" "text", "p_org_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_tracker_membership"("p_email" "text", "p_org_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_tracker_membership"("p_email" "text", "p_org_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_tracker_membership"("p_user_id" "uuid", "p_email" "text", "p_org_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_tracker_membership"("p_user_id" "uuid", "p_email" "text", "p_org_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_tracker_membership"("p_user_id" "uuid", "p_email" "text", "p_org_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_tracker_membership"("p_user_id" "uuid", "p_email" "text", "p_org_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_user_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_user_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_user_membership"("p_user_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_user_membership"("p_user_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_membership"("p_user_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_membership"("p_user_id" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_user_org_context"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_user_org_context"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_org_context"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_org_context"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_user_role"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_user_role"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_role"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_role"("p_user_id" "uuid", "p_org_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_user_tenant"("p_user" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_user_tenant"("p_user" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_tenant"("p_user" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_tenant"("p_user" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_users_public_by_uid"("p_uid" "uuid", "p_email" "text", "p_role" "text", "p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_users_public_by_uid"("p_uid" "uuid", "p_email" "text", "p_role" "text", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_users_public_by_uid"("p_uid" "uuid", "p_email" "text", "p_role" "text", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_users_public_by_uid"("p_uid" "uuid", "p_email" "text", "p_role" "text", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_users_public_for_auth_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_users_public_for_auth_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_users_public_for_auth_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_users_public_for_auth_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_users_public_for_current_user"("p_role" "text", "p_full_name" "text", "p_phone_e164" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_users_public_for_current_user"("p_role" "text", "p_full_name" "text", "p_phone_e164" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_users_public_for_current_user"("p_role" "text", "p_full_name" "text", "p_phone_e164" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_users_public_for_current_user"("p_role" "text", "p_full_name" "text", "p_phone_e164" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_default_org_id_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_default_org_id_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_default_org_id_for_current_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p_phone" "text") TO "service_role";



GRANT ALL ON TABLE "public"."personal" TO "anon";
GRANT ALL ON TABLE "public"."personal" TO "authenticated";
GRANT ALL ON TABLE "public"."personal" TO "service_role";



REVOKE ALL ON FUNCTION "public"."f_admin_personal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."f_admin_personal"() TO "anon";
GRANT ALL ON FUNCTION "public"."f_admin_personal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_admin_personal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_asignacion"("p_id" "uuid", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_asignacion"("p_id" "uuid", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."finish_asignacion"("p_id" "uuid", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish_asignacion"("p_id" "uuid", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fix_missing_membership_from_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fix_missing_membership_from_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."fix_missing_membership_from_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fix_missing_membership_from_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_normalize_phone_e164"("p_raw" "text", "p_default_cc" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_normalize_phone_e164"("p_raw" "text", "p_default_cc" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_normalize_phone_e164"("p_raw" "text", "p_default_cc" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_normalize_phone_e164"("p_raw" "text", "p_default_cc" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_normalize_phone_ec"("t" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_normalize_phone_ec"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_normalize_phone_ec"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_normalize_phone_ec"("t" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_personal_set_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_personal_set_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_personal_set_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_personal_set_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."g_cube_consistent"("internal", "public"."cube", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."g_cube_consistent"("internal", "public"."cube", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."g_cube_consistent"("internal", "public"."cube", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."g_cube_consistent"("internal", "public"."cube", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."g_cube_distance"("internal", "public"."cube", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."g_cube_distance"("internal", "public"."cube", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."g_cube_distance"("internal", "public"."cube", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."g_cube_distance"("internal", "public"."cube", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."g_cube_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."g_cube_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."g_cube_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."g_cube_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."g_cube_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."g_cube_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."g_cube_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."g_cube_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."g_cube_same"("public"."cube", "public"."cube", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."g_cube_same"("public"."cube", "public"."cube", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."g_cube_same"("public"."cube", "public"."cube", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."g_cube_same"("public"."cube", "public"."cube", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."g_cube_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."g_cube_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."g_cube_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."g_cube_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gc_get_active_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."gc_get_active_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gc_get_active_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gc_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gc_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gc_is_member_of_org"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."geo_distance"("point", "point") TO "postgres";
GRANT ALL ON FUNCTION "public"."geo_distance"("point", "point") TO "anon";
GRANT ALL ON FUNCTION "public"."geo_distance"("point", "point") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geo_distance"("point", "point") TO "service_role";



GRANT ALL ON FUNCTION "public"."geocerca_geojson_to_geometry"("p_geojson" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."geocerca_geojson_to_geometry"("p_geojson" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocerca_geojson_to_geometry"("p_geojson" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."geocerca_get"("p_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."geocerca_get"("p_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocerca_get"("p_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_bi_bu"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_bi_bu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_bi_bu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_bi_bu__orig"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_bi_bu__orig"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_bi_bu__orig"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_delete"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_delete"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_delete"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_delete_iof"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_delete_iof"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_delete_iof"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_enforce_canonical_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_enforce_canonical_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_enforce_canonical_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_fix_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_fix_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_fix_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_insert_iof"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_insert_iof"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_insert_iof"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_set_geom"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_set_geom"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_set_geom"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_sync_nombre_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_sync_nombre_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_sync_nombre_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_update_iof"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_update_iof"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_update_iof"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_upsert"("p_id" "uuid", "p_nombre" "text", "p_geojson" "jsonb", "p_visible" boolean, "p_activa" boolean, "p_color" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_upsert"("p_id" "uuid", "p_nombre" "text", "p_geojson" "jsonb", "p_visible" boolean, "p_activa" boolean, "p_color" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_upsert"("p_id" "uuid", "p_nombre" "text", "p_geojson" "jsonb", "p_visible" boolean, "p_activa" boolean, "p_color" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_v_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_v_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_v_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_v_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_v_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_v_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geocercas_v_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."geocercas_v_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geocercas_v_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geofence_upsert"("_id" "uuid", "_org" "uuid", "_name" "text", "_geojson" "jsonb", "_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geofence_upsert"("_id" "uuid", "_org" "uuid", "_name" "text", "_geojson" "jsonb", "_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geofence_upsert"("_id" "uuid", "_org" "uuid", "_name" "text", "_geojson" "jsonb", "_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."geofences_fill_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."geofences_fill_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geofences_fill_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geofences_set_user_and_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."geofences_set_user_and_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geofences_set_user_and_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geofences_sync_geom_json"() TO "anon";
GRANT ALL ON FUNCTION "public"."geofences_sync_geom_json"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geofences_sync_geom_json"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geofences_sync_geometry"() TO "anon";
GRANT ALL ON FUNCTION "public"."geofences_sync_geometry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."geofences_sync_geometry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geojson_to_coords"("g" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."geojson_to_coords"("g" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geojson_to_coords"("g" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_roots"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_roots"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_roots"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_setting"("p_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_setting"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_setting"("p_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_costos_asignaciones_v2"("p_org_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones_v2"("p_org_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones_v2"("p_org_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_costos_asignaciones_v2"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones_v2"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_costos_asignaciones_v2"("p_desde" "date", "p_hasta" "date", "p_personal" "uuid", "p_actividad" "uuid", "p_geocerca" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_costos_detalle_by_org"("p_org_id" "uuid", "p_desde" timestamp with time zone, "p_hasta" timestamp with time zone, "p_personal_id" "uuid", "p_activity_id" "uuid", "p_geocerca_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_costos_detalle_by_org"("p_org_id" "uuid", "p_desde" timestamp with time zone, "p_hasta" timestamp with time zone, "p_personal_id" "uuid", "p_activity_id" "uuid", "p_geocerca_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_costos_detalle_by_org"("p_org_id" "uuid", "p_desde" timestamp with time zone, "p_hasta" timestamp with time zone, "p_personal_id" "uuid", "p_activity_id" "uuid", "p_geocerca_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_org_id_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_org_id_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_org_id_for_current_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_org_id_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_org_id_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_org_id_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_role"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_role"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_role"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_org_and_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_org_and_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_org_and_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_geofence_id"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_geofence_id"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_geofence_id"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_org_for_uid"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_org_for_uid"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_org_for_uid"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_default_org_id_for_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_default_org_id_for_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_default_org_id_for_current_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_geocercas_for_current_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_geocercas_for_current_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_geocercas_for_current_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_geofence_context"("p_geofence_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_geofence_context"("p_geofence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_geofence_context"("p_geofence_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_max_trackers_for_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_max_trackers_for_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_max_trackers_for_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_context_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_context_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_context_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_default_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_default_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_default_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_id_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_id_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_id_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_limits"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_limits"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_limits"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_owner_org_id"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_owner_org_id"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_owner_org_id"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_request_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_request_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_request_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tracker_invite_claim"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tracker_invite_claim"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tracker_invite_claim"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "postgres";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "anon";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_profiles_direct_writes"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_profiles_direct_writes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_profiles_direct_writes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_admin_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("p_org" "uuid", "p_min" "public"."role_type") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("p_org" "uuid", "p_min" "public"."role_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("p_org" "uuid", "p_min" "public"."role_type") TO "service_role";



GRANT ALL ON FUNCTION "public"."init_admin_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."init_admin_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."init_admin_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_geocerca"("nombre" "text", "wkt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_geocerca"("nombre" "text", "wkt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_geocerca"("nombre" "text", "wkt" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_geocerca_json"("nombre" "text", "coords" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_geocerca_json"("nombre" "text", "coords" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_geocerca_json"("nombre" "text", "coords" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_recorded_at" timestamp with time zone, "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_recorded_at" timestamp with time zone, "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_recorded_at" timestamp with time zone, "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_captured_at" timestamp with time zone, "p_meta" "jsonb", "p_geofence_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_captured_at" timestamp with time zone, "p_meta" "jsonb", "p_geofence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_tracker_position"("p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_captured_at" timestamp with time zone, "p_meta" "jsonb", "p_geofence_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_member"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_member"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_member"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_member_by_email"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_member_by_email"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_member_by_email"("p_org" "uuid", "p_email" "text", "p_role" "public"."role_type") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_owner"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_owner"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_owner"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_role"("p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_role"("p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_role"("p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_role"("p_role" "public"."role_type") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_role"("p_role" "public"."role_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_role"("p_role" "public"."role_type") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_root"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_root"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_root"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_internal_bridge"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_internal_bridge"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_internal_bridge"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member"("p_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member"("p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member"("p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_owner"("p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_root_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_root_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_root_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_root_owner"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_root_owner"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_root_owner"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tracker_assigned_to_geofence"("p_org_id" "uuid", "p_geofence_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tracker_assigned_to_geofence"("p_org_id" "uuid", "p_geofence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tracker_assigned_to_geofence"("p_org_id" "uuid", "p_geofence_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."latitude"("public"."earth") TO "postgres";
GRANT ALL ON FUNCTION "public"."latitude"("public"."earth") TO "anon";
GRANT ALL ON FUNCTION "public"."latitude"("public"."earth") TO "authenticated";
GRANT ALL ON FUNCTION "public"."latitude"("public"."earth") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_asignaciones"("p_tenant_id" "uuid", "p_personal_id" "uuid", "p_geocerca_id" "uuid", "p_estado" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."list_asignaciones"("p_tenant_id" "uuid", "p_personal_id" "uuid", "p_geocerca_id" "uuid", "p_estado" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_asignaciones"("p_tenant_id" "uuid", "p_personal_id" "uuid", "p_geocerca_id" "uuid", "p_estado" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_geocercas_for_assign"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_geocercas_for_assign"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_geocercas_for_assign"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_members_with_email"("p_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_members_with_email"("p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_members_with_email"("p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_user_org_ids"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_user_org_ids"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_user_org_ids"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ll_to_earth"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."ll_to_earth"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."ll_to_earth"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ll_to_earth"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_event"("p_action" "text", "p_entity" "text", "p_entity_id" "uuid", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_event"("p_action" "text", "p_entity" "text", "p_entity_id" "uuid", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_event"("p_action" "text", "p_entity" "text", "p_entity_id" "uuid", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_location_and_attendance"("p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."log_location_and_attendance"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_location_and_attendance"("p_lat" double precision, "p_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."longitude"("public"."earth") TO "postgres";
GRANT ALL ON FUNCTION "public"."longitude"("public"."earth") TO "anon";
GRANT ALL ON FUNCTION "public"."longitude"("public"."earth") TO "authenticated";
GRANT ALL ON FUNCTION "public"."longitude"("public"."earth") TO "service_role";



GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "postgres";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lower"("p_role" "public"."role_type") TO "anon";
GRANT ALL ON FUNCTION "public"."lower"("p_role" "public"."role_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lower"("p_role" "public"."role_type") TO "service_role";



GRANT ALL ON FUNCTION "public"."memberships_role_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."memberships_role_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."memberships_role_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_personal_duplicates"() TO "anon";
GRANT ALL ON FUNCTION "public"."merge_personal_duplicates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_personal_duplicates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_to_tenant_by_name"("p_table" "regclass", "p_id_col" "text", "p_tenant_col" "text", "p_name_col" "text", "p_target_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_to_tenant_by_name"("p_table" "regclass", "p_id_col" "text", "p_tenant_col" "text", "p_name_col" "text", "p_target_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_to_tenant_by_name"("p_table" "regclass", "p_id_col" "text", "p_tenant_col" "text", "p_name_col" "text", "p_target_tenant" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start_ts" timestamp with time zone, "p_end_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start_ts" timestamp with time zone, "p_end_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_asignacion_dates"("p_asignacion_id" "uuid", "p_start_ts" timestamp with time zone, "p_end_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."my_org_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_org_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_org_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone_for_personal"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone_for_personal"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone_for_personal"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_org_invite_accepted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_org_invite_accepted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_org_invite_accepted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_organization_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_organization_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_organization_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_acl_probe"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_acl_probe"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_acl_probe"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_biu_defaults_v1"() TO "anon";
GRANT ALL ON FUNCTION "public"."personal_biu_defaults_v1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_biu_defaults_v1"() TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_compute_fingerprint"("p_nombre" "text", "p_apellido" "text", "p_email" "text", "p_telefono_norm" "text", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_compute_fingerprint"("p_nombre" "text", "p_apellido" "text", "p_email" "text", "p_telefono_norm" "text", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_compute_fingerprint"("p_nombre" "text", "p_apellido" "text", "p_email" "text", "p_telefono_norm" "text", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_delete_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_delete_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_delete_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_has_active_assignments"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_has_active_assignments"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_has_active_assignments"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_list"("_q" "text", "_only_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."personal_list"("_q" "text", "_only_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_list"("_q" "text", "_only_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_list"("_q" "text", "_include_deleted" boolean, "_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."personal_list"("_q" "text", "_include_deleted" boolean, "_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_list"("_q" "text", "_include_deleted" boolean, "_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_set_derived"() TO "anon";
GRANT ALL ON FUNCTION "public"."personal_set_derived"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_set_derived"() TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_set_vigente"("p_id" "uuid", "p_vigente" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."personal_set_vigente"("p_id" "uuid", "p_vigente" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_set_vigente"("p_id" "uuid", "p_vigente" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_soft_delete"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_soft_delete"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_soft_delete"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_toggle_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_toggle_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_toggle_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_upsert_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_upsert_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_upsert_admin"("p_org_id" "uuid", "p_user_id" "uuid", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."pick_active_org_for_user"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pick_active_org_for_user"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pick_active_org_for_user"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_membership_role_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_membership_role_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_membership_role_escalation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_past_asignaciones"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_past_asignaciones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_past_asignaciones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_personal_duplicate_on_undelete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_personal_duplicate_on_undelete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_personal_duplicate_on_undelete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_change_for_non_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_change_for_non_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_change_for_non_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_geofence_transitions"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_geofence_transitions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_geofence_transitions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_users_public_role_from_memberships"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_users_public_role_from_memberships"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_users_public_role_from_memberships"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_member"("p_org" "uuid", "p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_member"("p_org" "uuid", "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_member"("p_org" "uuid", "p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."repair_users_without_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."repair_users_without_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."repair_users_without_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."repair_users_without_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."repair_users_without_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."repair_users_without_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_geofence_id_from_geocerca"("p_geocerca_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_geofence_id_from_geocerca"("p_geocerca_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_geofence_id_from_geocerca"("p_geocerca_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_org_for_tracker_dashboard"() TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_org_for_tracker_dashboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_org_for_tracker_dashboard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_org_for_tracker_dashboard_for_uid"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_org_for_tracker_dashboard_for_uid"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_org_for_tracker_dashboard_for_uid"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_tenant_id_for_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_tenant_id_for_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_tenant_id_for_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_tracker_user_id"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_tracker_user_id"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_tracker_user_id"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."role_id_to_role"("p_role_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."role_id_to_role"("p_role_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."role_id_to_role"("p_role_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."role_priority"("p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."role_priority"("p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."role_priority"("p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."role_rank"("p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."role_rank"("p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."role_rank"("p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_accept_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_accept_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_accept_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_accept_pending_invites_for_me"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_accept_pending_invites_for_me"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_accept_pending_invites_for_me"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_admin_assign_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_admin_assign_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_admin_assign_geocerca"("p_user_id" "uuid", "p_geocerca_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_admin_upsert_phone"("p_user_id" "uuid", "p_telefono" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_admin_upsert_phone"("p_user_id" "uuid", "p_telefono" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_admin_upsert_phone"("p_user_id" "uuid", "p_telefono" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_crear_geocerca"("p_nombre" "text", "p_geom" "jsonb", "p_activa" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_crear_geocerca"("p_nombre" "text", "p_geom" "jsonb", "p_activa" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_crear_geocerca"("p_nombre" "text", "p_geom" "jsonb", "p_activa" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_create_tracker_invite"("p_org_id" "uuid", "p_email" "text", "p_expires_hours" integer, "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_create_tracker_invite"("p_org_id" "uuid", "p_email" "text", "p_expires_hours" integer, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_create_tracker_invite"("p_org_id" "uuid", "p_email" "text", "p_expires_hours" integer, "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_personal_list"("p_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_personal_list"("p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_personal_list"("p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_plan_tracker_vigente_usage"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_plan_tracker_vigente_usage"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_plan_tracker_vigente_usage"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_provision_tracker_and_assign"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_provision_tracker_and_assign"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_provision_tracker_and_assign"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_set_current_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_set_current_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_set_current_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_tracker_can_send"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_tracker_can_send"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_tracker_can_send"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_upsert_tracker_assignment"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_upsert_tracker_assignment"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_upsert_tracker_assignment"("p_tracker_user_id" "uuid", "p_geofence_id" "uuid", "p_frequency_minutes" integer, "p_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_add_to_publication"("p_pubname" "text", "p_schema" "text", "p_tablename" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_add_to_publication"("p_pubname" "text", "p_schema" "text", "p_tablename" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_add_to_publication"("p_pubname" "text", "p_schema" "text", "p_tablename" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_geom_from_geojson"("js" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_geom_from_geojson"("js" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_geom_from_geojson"("js" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."session_org_id_safe"() TO "anon";
GRANT ALL ON FUNCTION "public"."session_org_id_safe"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_org_id_safe"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_active_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_created_by_from_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_created_by_from_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_created_by_from_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_org_on_invite_accept"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_org_on_invite_accept"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_org_on_invite_accept"() TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_tracker_assignments_from_activity_assignments"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_tracker_assignments_from_activity_assignments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_tracker_assignments_from_activity_assignments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_tracker_assignments_from_asignaciones"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_tracker_assignments_from_asignaciones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_tracker_assignments_from_asignaciones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_geocercas_set_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_geocercas_set_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_geocercas_set_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_organizations_ensure_owner_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_organizations_ensure_owner_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_organizations_ensure_owner_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_organizations_owner_change_ensure_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_organizations_owner_change_ensure_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_organizations_owner_change_ensure_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "service_role";












GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "service_role";









GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."activity_assignments" TO "anon";
GRANT ALL ON TABLE "public"."activity_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."activity_rates" TO "anon";
GRANT ALL ON TABLE "public"."activity_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_rates" TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."app_root_owner" TO "authenticated";
GRANT ALL ON TABLE "public"."app_root_owner" TO "service_role";



GRANT ALL ON TABLE "public"."app_root_owners" TO "authenticated";
GRANT ALL ON TABLE "public"."app_root_owners" TO "service_role";



GRANT ALL ON TABLE "public"."app_root_users" TO "anon";
GRANT ALL ON TABLE "public"."app_root_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_root_users" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."app_superadmins" TO "anon";
GRANT ALL ON TABLE "public"."app_superadmins" TO "authenticated";
GRANT ALL ON TABLE "public"."app_superadmins" TO "service_role";



GRANT ALL ON TABLE "public"."app_user_roles" TO "anon";
GRANT ALL ON TABLE "public"."app_user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."asignaciones" TO "anon";
GRANT ALL ON TABLE "public"."asignaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."asignaciones" TO "service_role";



GRANT ALL ON TABLE "public"."asistencias" TO "anon";
GRANT ALL ON TABLE "public"."asistencias" TO "authenticated";
GRANT ALL ON TABLE "public"."asistencias" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_events" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attendance_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attendance_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attendance_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attendances" TO "anon";
GRANT ALL ON TABLE "public"."attendances" TO "authenticated";
GRANT ALL ON TABLE "public"."attendances" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."auth_signup_debug" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_signup_debug_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_signup_debug_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_signup_debug_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."geocerca_geofence_map" TO "authenticated";
GRANT ALL ON TABLE "public"."geocerca_geofence_map" TO "service_role";



GRANT ALL ON TABLE "public"."geocercas" TO "anon";
GRANT ALL ON TABLE "public"."geocercas" TO "authenticated";
GRANT ALL ON TABLE "public"."geocercas" TO "service_role";



GRANT ALL ON TABLE "public"."geocercas_tbl" TO "anon";
GRANT ALL ON TABLE "public"."geocercas_tbl" TO "authenticated";
GRANT ALL ON TABLE "public"."geocercas_tbl" TO "service_role";



GRANT ALL ON SEQUENCE "public"."geocercas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."geocercas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."geocercas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."geofence_assignments" TO "anon";
GRANT ALL ON TABLE "public"."geofence_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."geofence_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."geofence_bridge_errors" TO "service_role";



GRANT ALL ON SEQUENCE "public"."geofence_bridge_errors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."geofence_bridge_errors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."geofence_bridge_errors_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."geofence_events" TO "anon";
GRANT ALL ON TABLE "public"."geofence_events" TO "authenticated";
GRANT ALL ON TABLE "public"."geofence_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."geofence_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."geofence_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."geofence_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."geofence_members" TO "anon";
GRANT ALL ON TABLE "public"."geofence_members" TO "authenticated";
GRANT ALL ON TABLE "public"."geofence_members" TO "service_role";



GRANT ALL ON TABLE "public"."geofences" TO "anon";
GRANT ALL ON TABLE "public"."geofences" TO "authenticated";
GRANT ALL ON TABLE "public"."geofences" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."org_billing" TO "authenticated";
GRANT ALL ON TABLE "public"."org_billing" TO "service_role";



GRANT ALL ON TABLE "public"."org_invites" TO "anon";
GRANT ALL ON TABLE "public"."org_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."org_invites" TO "service_role";



GRANT ALL ON TABLE "public"."org_members" TO "anon";
GRANT ALL ON TABLE "public"."org_members" TO "authenticated";
GRANT ALL ON TABLE "public"."org_members" TO "service_role";



GRANT ALL ON TABLE "public"."org_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."org_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."org_people" TO "authenticated";
GRANT ALL ON TABLE "public"."org_people" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."org_tenant_map" TO "authenticated";
GRANT ALL ON TABLE "public"."org_tenant_map" TO "service_role";



GRANT ALL ON TABLE "public"."org_users" TO "anon";
GRANT ALL ON TABLE "public"."org_users" TO "authenticated";
GRANT ALL ON TABLE "public"."org_users" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."pending_invites" TO "anon";
GRANT ALL ON TABLE "public"."pending_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_invites" TO "service_role";



GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";



GRANT ALL ON TABLE "public"."personas" TO "anon";
GRANT ALL ON TABLE "public"."personas" TO "authenticated";
GRANT ALL ON TABLE "public"."personas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."personas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."personas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."personas_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."plan_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_limits" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."posiciones" TO "anon";
GRANT ALL ON TABLE "public"."posiciones" TO "authenticated";
GRANT ALL ON TABLE "public"."posiciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."posiciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."posiciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."posiciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."position_events" TO "anon";
GRANT ALL ON TABLE "public"."position_events" TO "authenticated";
GRANT ALL ON TABLE "public"."position_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."position_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."position_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."position_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_block_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."profiles_block_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."profiles_block_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."profiles_block_log_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."role_map_membership_to_app" TO "authenticated";
GRANT ALL ON TABLE "public"."role_map_membership_to_app" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sync_errors" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sync_errors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sync_errors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sync_errors_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."tracker_assignments" TO "anon";
GRANT ALL ON TABLE "public"."tracker_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."tracker_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_invites" TO "service_role";



GRANT ALL ON TABLE "public"."tracker_latest" TO "anon";
GRANT ALL ON TABLE "public"."tracker_latest" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_latest" TO "service_role";



GRANT ALL ON TABLE "public"."tracker_locations" TO "anon";
GRANT ALL ON TABLE "public"."tracker_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_locations" TO "service_role";



GRANT ALL ON TABLE "public"."tracker_logs" TO "anon";
GRANT ALL ON TABLE "public"."tracker_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tracker_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tracker_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tracker_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tracker_positions" TO "anon";
GRANT ALL ON TABLE "public"."tracker_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_positions" TO "service_role";



GRANT ALL ON TABLE "public"."tracker_positions_legacy" TO "anon";
GRANT ALL ON TABLE "public"."tracker_positions_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_positions_legacy" TO "service_role";



GRANT ALL ON TABLE "public"."user_current_org" TO "anon";
GRANT ALL ON TABLE "public"."user_current_org" TO "authenticated";
GRANT ALL ON TABLE "public"."user_current_org" TO "service_role";



GRANT ALL ON TABLE "public"."user_geofence_state" TO "anon";
GRANT ALL ON TABLE "public"."user_geofence_state" TO "authenticated";
GRANT ALL ON TABLE "public"."user_geofence_state" TO "service_role";



GRANT ALL ON TABLE "public"."user_org_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_org_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_org_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_organizations" TO "anon";
GRANT ALL ON TABLE "public"."user_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_organizations" TO "service_role";



GRANT ALL ON TABLE "public"."user_orgs" TO "anon";
GRANT ALL ON TABLE "public"."user_orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_orgs" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."users_public" TO "anon";
GRANT ALL ON TABLE "public"."users_public" TO "authenticated";
GRANT ALL ON TABLE "public"."users_public" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."v_geocercas_tracker_ui" TO "anon";
GRANT ALL ON TABLE "public"."v_geocercas_tracker_ui" TO "authenticated";
GRANT ALL ON TABLE "public"."v_geocercas_tracker_ui" TO "service_role";



GRANT ALL ON TABLE "public"."v_org_people_ui" TO "authenticated";
GRANT ALL ON TABLE "public"."v_org_people_ui" TO "service_role";



GRANT ALL ON TABLE "public"."v_org_people_ui_all" TO "authenticated";
GRANT ALL ON TABLE "public"."v_org_people_ui_all" TO "service_role";
GRANT SELECT ON TABLE "public"."v_org_people_ui_all" TO "anon";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








