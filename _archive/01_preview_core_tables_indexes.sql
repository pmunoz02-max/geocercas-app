-- 01_preview_core_tables_indexes.sql
-- Core schema (sin backup/legacy/clone/archive/orphan)

CREATE SCHEMA IF NOT EXISTS "public";

COMMENT ON SCHEMA "public" IS 'standard public schema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='app_role'
  ) THEN
    CREATE TYPE "public"."app_role" AS ENUM (
    'owner',
    'admin',
    'tracker'
);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='assign_result'
  ) THEN
    CREATE TYPE "public"."assign_result" AS (
	"status" "text",
	"message" "text"
);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='attendance_kind'
  ) THEN
    CREATE TYPE "public"."attendance_kind" AS ENUM (
    'check_in',
    'check_out'
);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='invite_status'
  ) THEN
    CREATE TYPE "public"."invite_status" AS ENUM (
    'pending',
    'accepted',
    'cancelled',
    'expired'
);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='plan_code'
  ) THEN
    CREATE TYPE "public"."plan_code" AS ENUM (
    'starter',
    'pro',
    'enterprise',
    'free',
    'elite',
    'elite_plus'
);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='role_type'
  ) THEN
    CREATE TYPE "public"."role_type" AS ENUM (
    'owner',
    'admin',
    'tracker',
    'viewer'
);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."role_type" DEFAULT 'viewer'::"public"."role_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_default" boolean DEFAULT false NOT NULL,
    "revoked_at" timestamp with time zone
);

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

COMMENT ON COLUMN "public"."tracker_assignments"."period_tstz" IS 'Rango activo por hora exacta (tstzrange). Usar preferentemente sobre period (daterange).';

COMMENT ON COLUMN "public"."tracker_assignments"."activity_id" IS 'Actividad asignada (FK a public.activities.id). Nullable para compatibilidad histórica.';

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
    CONSTRAINT "asignaciones_fecha_check" CHECK ((("start_date" IS NULL) OR ("end_date" IS NULL) OR ("start_date" <= "end_date"))),
    CONSTRAINT "asignaciones_freq_chk" CHECK ((("frecuencia_envio_sec" IS NULL) OR ("frecuencia_envio_sec" >= 300))),
    CONSTRAINT "asignaciones_person_ref_check" CHECK ((("personal_id" IS NOT NULL) OR ("org_people_id" IS NOT NULL)))
);

ALTER TABLE ONLY "public"."asignaciones" FORCE ROW LEVEL SECURITY;

COMMENT ON COLUMN "public"."asignaciones"."org_people_id" IS 'Referencia canónica a org_people (membresía persona↔org).';

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

COMMENT ON COLUMN "public"."organizations"."suspended" IS 'Si true, la organización está suspendida (bloqueo de acceso por pruebas/impago/soporte). No borra datos ni usuarios.';

COMMENT ON COLUMN "public"."organizations"."is_personal" IS 'True only for the single "personal/default" organization per owner_id. Enforced by partial unique index.';

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

CREATE TABLE IF NOT EXISTS "public"."activity_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "usd_per_day" numeric(10,2) NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    CONSTRAINT "chk_ar_dates" CHECK ((("end_date" IS NULL) OR ("start_date" <= "end_date")))
);

CREATE TABLE IF NOT EXISTS "public"."admins" (
    "email" "text" NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."admins" FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "public"."app_root_owner" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."app_root_owners" (
    "user_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);

COMMENT ON TABLE "public"."app_root_owners" IS 'Lista canónica de usuarios ROOT (superadmin) que pueden invitar admins/owners.';

COMMENT ON COLUMN "public"."app_root_owners"."user_id" IS 'auth.users.id del ROOT';

COMMENT ON COLUMN "public"."app_root_owners"."active" IS 'Si false, ese ROOT queda revocado';

CREATE TABLE IF NOT EXISTS "public"."app_root_users" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);

COMMENT ON TABLE "public"."app_settings" IS 'Configuraciones globales de la app (no por org).';

COMMENT ON COLUMN "public"."app_settings"."key" IS 'Clave única (ej: app_root_emails).';

COMMENT ON COLUMN "public"."app_settings"."value" IS 'JSONB: valor de configuración.';

COMMENT ON COLUMN "public"."app_settings"."updated_by" IS 'auth.uid() que actualizó.';

CREATE TABLE IF NOT EXISTS "public"."app_superadmins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);

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

CREATE TABLE IF NOT EXISTS "public"."attendance_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "kind" "public"."attendance_kind" NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS "public"."attendance_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

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

CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor" "uuid",
    "action" "text" NOT NULL,
    "entity" "text",
    "entity_id" "uuid",
    "details" "jsonb"
);

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

CREATE SEQUENCE IF NOT EXISTS "public"."auth_signup_debug_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."auth_signup_debug_id_seq" OWNED BY "public"."auth_signup_debug"."id";

CREATE TABLE IF NOT EXISTS "public"."geocerca_geofence_map" (
    "org_id" "uuid" NOT NULL,
    "geocerca_id" "uuid" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

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

CREATE TABLE IF NOT EXISTS "public"."geofence_bridge_errors" (
    "id" bigint NOT NULL,
    "geocerca_id" "uuid" NOT NULL,
    "error_message" "text" NOT NULL,
    "geojson_type" "text",
    "geojson_head" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS "public"."geofence_bridge_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."geofence_bridge_errors_id_seq" OWNED BY "public"."geofence_bridge_errors"."id";

CREATE TABLE IF NOT EXISTS "public"."geofence_events" (
    "id" bigint NOT NULL,
    "user_id" "text" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "geofence_events_event_check" CHECK (("event" = ANY (ARRAY['enter'::"text", 'exit'::"text"])))
);

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

CREATE TABLE IF NOT EXISTS "public"."org_billing" (
    "org_id" "uuid" NOT NULL,
    "plan_code" "text" DEFAULT 'starter'::"text" NOT NULL,
    "tracker_limit_override" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

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

CREATE TABLE IF NOT EXISTS "public"."org_members" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "org_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'owner'::"text", 'tracker'::"text"])))
);

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

CREATE TABLE IF NOT EXISTS "public"."org_tenant_map" (
    "org_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'geocercas'::"text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."org_users" (
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "org_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'tracker'::"text"])))
);

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

CREATE TABLE IF NOT EXISTS "public"."personas" (
    "id" bigint NOT NULL,
    "nombre" "text" NOT NULL,
    "apellido" "text",
    "email" "text"
);

CREATE SEQUENCE IF NOT EXISTS "public"."personas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."personas_id_seq" OWNED BY "public"."personas"."id";

CREATE TABLE IF NOT EXISTS "public"."plan_limits" (
    "plan" "text" NOT NULL,
    "max_geocercas" integer NOT NULL,
    "max_trackers" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."plans" (
    "code" "public"."plan_code" NOT NULL,
    "name" "text" NOT NULL,
    "geofence_limit" integer NOT NULL,
    "tracker_limit" integer NOT NULL,
    "price_month_usd" numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."posiciones" (
    "id" bigint NOT NULL,
    "tracker_id" "uuid" NOT NULL,
    "geocerca_id" "uuid",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);

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

CREATE SEQUENCE IF NOT EXISTS "public"."position_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."position_events_id_seq" OWNED BY "public"."position_events"."id";

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

CREATE SEQUENCE IF NOT EXISTS "public"."profiles_block_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."profiles_block_log_id_seq" OWNED BY "public"."profiles_block_log"."id";

CREATE TABLE IF NOT EXISTS "public"."role_map_membership_to_app" (
    "membership_role" "text" NOT NULL,
    "app_role" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    CONSTRAINT "roles_name_check" CHECK (("char_length"("name") > 0))
);

CREATE TABLE IF NOT EXISTS "public"."sync_errors" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asignacion_id" "uuid",
    "error_text" "text"
);

CREATE SEQUENCE IF NOT EXISTS "public"."sync_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."sync_errors_id_seq" OWNED BY "public"."sync_errors"."id";

CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'free'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."tracker_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email_norm" "text" NOT NULL,
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "used_by_user_id" "uuid",
    "is_active" boolean DEFAULT false NOT NULL
);

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
    "user_id" "uuid",
    "geocerca_id" "uuid",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy" double precision,
    "speed" double precision,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."user_geofence_state" (
    "user_id" "text" NOT NULL,
    "geofence_id" "uuid" NOT NULL,
    "inside" boolean NOT NULL,
    "last_ts" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."user_org_settings" (
    "user_id" "uuid" NOT NULL,
    "active_org_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."user_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_organizations_role_check" CHECK (("role" = ANY (ARRAY['OWNER'::"text", 'ADMIN'::"text", 'TRACKER'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."user_orgs" (
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "telefono" "text"
);

CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."users_public" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "phone_e164" "text",
    "role" "public"."app_role" NOT NULL,
    "tenant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "rol" "text" DEFAULT 'tracker'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "nombre" "text",
    "phone_e164" "text",
    CONSTRAINT "usuarios_phone_e164_ck" CHECK ((("phone_e164" IS NULL) OR ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$'::"text")))
);

ALTER TABLE ONLY "public"."attendance_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."attendance_events_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."auth_signup_debug" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_signup_debug_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."geofence_bridge_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."geofence_bridge_errors_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."personas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."personas_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."position_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."position_events_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."profiles_block_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."profiles_block_log_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."sync_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sync_errors_id_seq"'::"regclass");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activities' AND c.conname='activities_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."activities" ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activities' AND c.conname='activities_tenant_name_uniq'
  ) THEN
    ALTER TABLE ONLY "public"."activities" ADD CONSTRAINT "activities_tenant_name_uniq" UNIQUE ("tenant_id", "name");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_assignments' AND c.conname='activity_assignments_no_overlap'
  ) THEN
    ALTER TABLE ONLY "public"."activity_assignments" ADD CONSTRAINT "activity_assignments_no_overlap" EXCLUDE USING "gist" ("tenant_id" WITH =, "tracker_user_id" WITH =, "daterange"("start_date", COALESCE("end_date", 'infinity'::"date"), '[]'::"text") WITH &&);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_assignments' AND c.conname='activity_assignments_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."activity_assignments" ADD CONSTRAINT "activity_assignments_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_rates' AND c.conname='activity_rates_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."activity_rates" ADD CONSTRAINT "activity_rates_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='admins' AND c.conname='admins_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."admins" ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("email");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_root_owner' AND c.conname='app_root_owner_email_key'
  ) THEN
    ALTER TABLE ONLY "public"."app_root_owner" ADD CONSTRAINT "app_root_owner_email_key" UNIQUE ("email");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_root_owner' AND c.conname='app_root_owner_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_root_owner" ADD CONSTRAINT "app_root_owner_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_root_owners' AND c.conname='app_root_owners_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_root_owners" ADD CONSTRAINT "app_root_owners_pkey" PRIMARY KEY ("user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_root_users' AND c.conname='app_root_users_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_root_users" ADD CONSTRAINT "app_root_users_pkey" PRIMARY KEY ("user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_settings' AND c.conname='app_settings_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_superadmins' AND c.conname='app_superadmins_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_superadmins" ADD CONSTRAINT "app_superadmins_pkey" PRIMARY KEY ("user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_user_roles' AND c.conname='app_user_roles_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_user_roles" ADD CONSTRAINT "app_user_roles_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_user_roles' AND c.conname='app_user_roles_user_id_org_id_key'
  ) THEN
    ALTER TABLE ONLY "public"."app_user_roles" ADD CONSTRAINT "app_user_roles_user_id_org_id_key" UNIQUE ("user_id", "org_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_personal_no_overlap'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_personal_no_overlap" EXCLUDE USING "gist" ("org_id" WITH =, "personal_id" WITH =, "tstzrange"("start_time", "end_time", '[]'::"text") WITH &&) WHERE (("is_deleted" = false));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_pkey1'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_pkey1" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asistencias' AND c.conname='asistencias_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."asistencias" ADD CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='attendance_events' AND c.conname='attendance_events_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."attendance_events" ADD CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='attendances' AND c.conname='attendances_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."attendances" ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='audit_log' AND c.conname='audit_log_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."audit_log" ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='auth_signup_debug' AND c.conname='auth_signup_debug_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."auth_signup_debug" ADD CONSTRAINT "auth_signup_debug_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='ex_asig_no_overlap'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "ex_asig_no_overlap" EXCLUDE USING "gist" ("tracker_user_id" WITH =, "geofence_id" WITH =, "period" WITH &&);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geocerca_geofence_map' AND c.conname='geocerca_geofence_map_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."geocerca_geofence_map" ADD CONSTRAINT "geocerca_geofence_map_pkey" PRIMARY KEY ("org_id", "geocerca_id");
  END IF;
END$$;

ALTER TABLE "public"."geocercas"
    ADD CONSTRAINT "geocercas_geom_presence_chk" CHECK ((("geojson" IS NOT NULL) OR (("lat" IS NOT NULL) AND ("lng" IS NOT NULL) AND ("radius_m" IS NOT NULL)))) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geocercas' AND c.conname='geocercas_org_id_nombre_ci_key'
  ) THEN
    ALTER TABLE ONLY "public"."geocercas" ADD CONSTRAINT "geocercas_org_id_nombre_ci_key" UNIQUE ("org_id", "nombre_ci");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geocercas_tbl' AND c.conname='geocercas_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."geocercas_tbl" ADD CONSTRAINT "geocercas_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geocercas' AND c.conname='geocercas_pkey1'
  ) THEN
    ALTER TABLE ONLY "public"."geocercas" ADD CONSTRAINT "geocercas_pkey1" PRIMARY KEY ("id");
  END IF;
END$$;

ALTER TABLE "public"."geocercas"
    ADD CONSTRAINT "geocercas_radius_positive_chk" CHECK ((("radius_m" IS NULL) OR ("radius_m" > 0))) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofence_assignments' AND c.conname='geofence_assignments_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofence_assignments" ADD CONSTRAINT "geofence_assignments_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofence_bridge_errors' AND c.conname='geofence_bridge_errors_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofence_bridge_errors" ADD CONSTRAINT "geofence_bridge_errors_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofence_events' AND c.conname='geofence_events_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofence_events" ADD CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofence_members' AND c.conname='geofence_members_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofence_members" ADD CONSTRAINT "geofence_members_pkey" PRIMARY KEY ("geofence_id", "user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofences' AND c.conname='geofences_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofences" ADD CONSTRAINT "geofences_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='invitations' AND c.conname='invitations_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."invitations" ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='memberships' AND c.conname='memberships_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."memberships" ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("org_id", "user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_billing' AND c.conname='org_billing_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_billing" ADD CONSTRAINT "org_billing_pkey" PRIMARY KEY ("org_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_invites' AND c.conname='org_invites_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_invites" ADD CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_invites' AND c.conname='org_invites_unique_active'
  ) THEN
    ALTER TABLE ONLY "public"."org_invites" ADD CONSTRAINT "org_invites_unique_active" UNIQUE ("org_id", "email", "role");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_members' AND c.conname='org_members_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_members" ADD CONSTRAINT "org_members_pkey" PRIMARY KEY ("org_id", "user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_people' AND c.conname='org_people_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_people" ADD CONSTRAINT "org_people_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_tenant_map' AND c.conname='org_tenant_map_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_tenant_map" ADD CONSTRAINT "org_tenant_map_pkey" PRIMARY KEY ("org_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_users' AND c.conname='org_users_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_users" ADD CONSTRAINT "org_users_pkey" PRIMARY KEY ("user_id", "org_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='organizations' AND c.conname='organizations_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."organizations" ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='pending_invites' AND c.conname='pending_invites_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."pending_invites" ADD CONSTRAINT "pending_invites_pkey" PRIMARY KEY ("email");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='people' AND c.conname='people_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."people" ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='personal' AND c.conname='personal_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."personal" ADD CONSTRAINT "personal_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='personas' AND c.conname='personas_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."personas" ADD CONSTRAINT "personas_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='plan_limits' AND c.conname='plan_limits_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."plan_limits" ADD CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("plan");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='plans' AND c.conname='plans_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."plans" ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("code");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='posiciones' AND c.conname='posiciones_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."posiciones" ADD CONSTRAINT "posiciones_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='position_events' AND c.conname='position_events_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."position_events" ADD CONSTRAINT "position_events_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='positions' AND c.conname='positions_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."positions" ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='profiles_block_log' AND c.conname='profiles_block_log_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."profiles_block_log" ADD CONSTRAINT "profiles_block_log_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='profiles' AND c.conname='profiles_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='role_map_membership_to_app' AND c.conname='role_map_membership_to_app_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."role_map_membership_to_app" ADD CONSTRAINT "role_map_membership_to_app_pkey" PRIMARY KEY ("membership_role");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='roles' AND c.conname='roles_name_key'
  ) THEN
    ALTER TABLE ONLY "public"."roles" ADD CONSTRAINT "roles_name_key" UNIQUE ("name");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='roles' AND c.conname='roles_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='roles' AND c.conname='roles_slug_key'
  ) THEN
    ALTER TABLE ONLY "public"."roles" ADD CONSTRAINT "roles_slug_key" UNIQUE ("slug");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='sync_errors' AND c.conname='sync_errors_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."sync_errors" ADD CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tenants' AND c.conname='tenants_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."tenants" ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='tracker_assignments_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "tracker_assignments_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='tracker_assignments_tracker_geofence_uniq'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "tracker_assignments_tracker_geofence_uniq" UNIQUE ("tracker_user_id", "geofence_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_invites' AND c.conname='tracker_invites_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_invites" ADD CONSTRAINT "tracker_invites_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_latest' AND c.conname='tracker_latest_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_latest" ADD CONSTRAINT "tracker_latest_pkey" PRIMARY KEY ("user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_locations' AND c.conname='tracker_locations_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_locations" ADD CONSTRAINT "tracker_locations_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_logs' AND c.conname='tracker_logs_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_logs" ADD CONSTRAINT "tracker_logs_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_positions' AND c.conname='tracker_positions_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_positions" ADD CONSTRAINT "tracker_positions_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_geofence_state' AND c.conname='user_geofence_state_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_geofence_state" ADD CONSTRAINT "user_geofence_state_pkey" PRIMARY KEY ("user_id", "geofence_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_org_settings' AND c.conname='user_org_settings_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_org_settings" ADD CONSTRAINT "user_org_settings_pkey" PRIMARY KEY ("user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_organizations' AND c.conname='user_organizations_org_user_unique'
  ) THEN
    ALTER TABLE ONLY "public"."user_organizations" ADD CONSTRAINT "user_organizations_org_user_unique" UNIQUE ("org_id", "user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_organizations' AND c.conname='user_organizations_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_organizations" ADD CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_orgs' AND c.conname='user_orgs_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_orgs" ADD CONSTRAINT "user_orgs_pkey" PRIMARY KEY ("user_id", "org_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_orgs' AND c.conname='user_orgs_user_org_unique'
  ) THEN
    ALTER TABLE ONLY "public"."user_orgs" ADD CONSTRAINT "user_orgs_user_org_unique" UNIQUE ("user_id", "org_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_profiles' AND c.conname='user_profiles_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_profiles" ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_roles' AND c.conname='user_roles_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='users_public' AND c.conname='users_public_email_key'
  ) THEN
    ALTER TABLE ONLY "public"."users_public" ADD CONSTRAINT "users_public_email_key" UNIQUE ("email");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='users_public' AND c.conname='users_public_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."users_public" ADD CONSTRAINT "users_public_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='usuarios' AND c.conname='usuarios_email_key'
  ) THEN
    ALTER TABLE ONLY "public"."usuarios" ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='usuarios' AND c.conname='usuarios_pkey'
  ) THEN
    ALTER TABLE ONLY "public"."usuarios" ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "activities_org_id_idx" ON "public"."activities" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "activities_tenant_id_idx" ON "public"."activities" USING "btree" ("tenant_id");

CREATE UNIQUE INDEX IF NOT EXISTS "app_user_roles_user_org_ux" ON "public"."app_user_roles" USING "btree" ("user_id", "org_id");

CREATE INDEX IF NOT EXISTS "asignaciones_geocerca_idx" ON "public"."asignaciones" USING "btree" ("geocerca_id");

CREATE INDEX IF NOT EXISTS "asignaciones_personal_idx" ON "public"."asignaciones" USING "btree" ("personal_id");

CREATE INDEX IF NOT EXISTS "asignaciones_rango_idx" ON "public"."asignaciones" USING "btree" ("start_date", "end_date");

CREATE UNIQUE INDEX IF NOT EXISTS "asistencias_user_fecha_uniq" ON "public"."asistencias" USING "btree" ("user_id", "fecha");

CREATE INDEX IF NOT EXISTS "attendances_email_created_idx" ON "public"."attendances" USING "btree" ("email", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "attendances_geofence_created_idx" ON "public"."attendances" USING "btree" ("geofence_name", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "attendances_inside_created_idx" ON "public"."attendances" USING "btree" ("inside_geofence", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "geocercas_active_idx" ON "public"."geocercas" USING "btree" ("active");

CREATE INDEX IF NOT EXISTS "geocercas_activo_idx" ON "public"."geocercas" USING "btree" ("activo");

CREATE INDEX IF NOT EXISTS "geocercas_created_at_idx" ON "public"."geocercas_tbl" USING "btree" ("created_at");

CREATE INDEX IF NOT EXISTS "geocercas_created_by_idx" ON "public"."geocercas_tbl" USING "btree" ("created_by");

CREATE INDEX IF NOT EXISTS "geocercas_created_idx" ON "public"."geocercas" USING "btree" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "geocercas_geojson_gin" ON "public"."geocercas_tbl" USING "gin" ("geojson");

CREATE INDEX IF NOT EXISTS "geocercas_geom_gin" ON "public"."geocercas" USING "gin" ("geom");

CREATE INDEX IF NOT EXISTS "geocercas_geom_gix" ON "public"."geocercas_tbl" USING "gist" ("geom");

CREATE INDEX IF NOT EXISTS "geocercas_geom_idx" ON "public"."geocercas_tbl" USING "gist" ((("geom")::"public"."geometry"));

CREATE INDEX IF NOT EXISTS "geocercas_gin_bbox_idx" ON "public"."geocercas" USING "gin" ("bbox");

CREATE INDEX IF NOT EXISTS "geocercas_gin_geojson" ON "public"."geocercas" USING "gin" ("geojson");

CREATE INDEX IF NOT EXISTS "geocercas_gin_geojson_idx" ON "public"."geocercas" USING "gin" ("geojson");

CREATE INDEX IF NOT EXISTS "geocercas_id_text_idx" ON "public"."geocercas" USING "btree" ("id_text");

CREATE UNIQUE INDEX IF NOT EXISTS "geocercas_id_text_key" ON "public"."geocercas" USING "btree" ("id_text") WHERE ("id_text" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "geocercas_org_id_idx" ON "public"."geocercas" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "geocercas_org_idx" ON "public"."geocercas" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "geocercas_org_is_deleted_idx" ON "public"."geocercas" USING "btree" ("org_id", "is_deleted");

CREATE INDEX IF NOT EXISTS "geocercas_owner_id_idx" ON "public"."geocercas_tbl" USING "btree" ("owner_id");

CREATE INDEX IF NOT EXISTS "geocercas_owner_idx" ON "public"."geocercas_tbl" USING "btree" ("owner_id");

CREATE INDEX IF NOT EXISTS "geocercas_updated_idx" ON "public"."geocercas" USING "btree" ("updated_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "geocercas_user_nombre_unique" ON "public"."geocercas" USING "btree" ("usuario_id", "lower"("name"));

CREATE UNIQUE INDEX IF NOT EXISTS "geocercas_usuario_nombre_unique" ON "public"."geocercas_tbl" USING "btree" ("usuario_id", "nombre");

CREATE UNIQUE INDEX IF NOT EXISTS "geocercas_usuario_nombre_unique_idx" ON "public"."geocercas_tbl" USING "btree" ("usuario_id", "nombre");

CREATE INDEX IF NOT EXISTS "geocercas_visible_idx" ON "public"."geocercas" USING "btree" ("visible");

CREATE INDEX IF NOT EXISTS "geofences_geom_gix" ON "public"."geofences" USING "gist" ("geom");

CREATE INDEX IF NOT EXISTS "geofences_org_id_idx" ON "public"."geofences" USING "btree" ("org_id");

CREATE UNIQUE INDEX IF NOT EXISTS "geofences_org_name_ci_uq" ON "public"."geofences" USING "btree" ("org_id", "lower"("name"));

CREATE INDEX IF NOT EXISTS "idx_aa_tracker_range" ON "public"."activity_assignments" USING "btree" ("tracker_user_id", "start_date", "end_date");

CREATE INDEX IF NOT EXISTS "idx_activities_tenant_active" ON "public"."activities" USING "btree" ("tenant_id", "active");

CREATE INDEX IF NOT EXISTS "idx_app_user_roles_org" ON "public"."app_user_roles" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_app_user_roles_user" ON "public"."app_user_roles" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_app_user_roles_user_id" ON "public"."app_user_roles" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_app_user_roles_user_org" ON "public"."app_user_roles" USING "btree" ("user_id", "org_id");

CREATE INDEX IF NOT EXISTS "idx_ar_activity_range" ON "public"."activity_rates" USING "btree" ("activity_id", "start_date", "end_date");

CREATE INDEX IF NOT EXISTS "idx_asig_estado" ON "public"."asignaciones" USING "btree" ("estado");

CREATE INDEX IF NOT EXISTS "idx_asig_geocerca" ON "public"."asignaciones" USING "btree" ("geocerca_id");

CREATE INDEX IF NOT EXISTS "idx_asig_tenant" ON "public"."asignaciones" USING "btree" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_asignaciones_geocerca_id" ON "public"."asignaciones" USING "btree" ("geocerca_id");

CREATE INDEX IF NOT EXISTS "idx_asignaciones_not_deleted" ON "public"."asignaciones" USING "btree" ("is_deleted");

CREATE INDEX IF NOT EXISTS "idx_asignaciones_org_id" ON "public"."asignaciones" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_asignaciones_owner_org" ON "public"."asignaciones" USING "btree" ("owner_id", "org_id");

CREATE INDEX IF NOT EXISTS "idx_asignaciones_personal_id" ON "public"."asignaciones" USING "btree" ("personal_id");

CREATE INDEX IF NOT EXISTS "idx_asignaciones_tenant_id" ON "public"."asignaciones" USING "btree" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_assignments_geofence" ON "public"."geofence_assignments" USING "btree" ("geofence_id");

CREATE INDEX IF NOT EXISTS "idx_assignments_tracker" ON "public"."geofence_assignments" USING "btree" ("tracker_email");

CREATE INDEX IF NOT EXISTS "idx_att_created_at" ON "public"."attendances" USING "btree" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_att_email" ON "public"."attendances" USING "btree" ("email");

CREATE INDEX IF NOT EXISTS "idx_attendance_events_user_ts" ON "public"."attendance_events" USING "btree" ("user_id", "ts" DESC);

CREATE INDEX IF NOT EXISTS "idx_attendances_org_created" ON "public"."attendances" USING "btree" ("org_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_attendances_org_created_at" ON "public"."attendances" USING "btree" ("org_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_attendances_org_email" ON "public"."attendances" USING "btree" ("org_id", "email");

CREATE INDEX IF NOT EXISTS "idx_geocerca_geofence_map_geocerca" ON "public"."geocerca_geofence_map" USING "btree" ("org_id", "geocerca_id");

CREATE INDEX IF NOT EXISTS "idx_geocerca_geofence_map_geofence" ON "public"."geocerca_geofence_map" USING "btree" ("org_id", "geofence_id");

CREATE INDEX IF NOT EXISTS "idx_geofence_events_user_ts" ON "public"."geofence_events" USING "btree" ("user_id", "ts" DESC);

CREATE INDEX IF NOT EXISTS "idx_geofences_active" ON "public"."geofences" USING "btree" ("active");

CREATE INDEX IF NOT EXISTS "idx_geofences_geom" ON "public"."geofences" USING "gist" ("geom");

CREATE INDEX IF NOT EXISTS "idx_geofences_org" ON "public"."geofences" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_latest_tracker_position_tracker" ON "public"."latest_tracker_position" USING "btree" ("tracker_id");

CREATE INDEX IF NOT EXISTS "idx_members_with_profiles_org" ON "public"."memberships" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_memberships_tracker_vigente" ON "public"."memberships" USING "btree" ("org_id") WHERE (("role" = 'tracker'::"public"."role_type") AND ("revoked_at" IS NULL));

CREATE INDEX IF NOT EXISTS "idx_memberships_user_org" ON "public"."memberships" USING "btree" ("user_id", "org_id");

CREATE INDEX IF NOT EXISTS "idx_org_billing_plan" ON "public"."org_billing" USING "btree" ("plan_code");

CREATE INDEX IF NOT EXISTS "idx_org_invites_email" ON "public"."org_invites" USING "btree" ("email");

CREATE INDEX IF NOT EXISTS "idx_org_invites_org" ON "public"."org_invites" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_org_members_user_org" ON "public"."org_members" USING "btree" ("user_id", "org_id");

CREATE INDEX IF NOT EXISTS "idx_org_users_org" ON "public"."org_users" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_org_users_user" ON "public"."org_users" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_pe_tenant_ts" ON "public"."position_events" USING "btree" ("tenant_id", "ts" DESC);

CREATE INDEX IF NOT EXISTS "idx_personal_fechas" ON "public"."personal" USING "btree" ("fecha_inicio", "fecha_fin");

CREATE INDEX IF NOT EXISTS "idx_personal_org" ON "public"."personal" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_personal_org_emailnorm" ON "public"."personal" USING "btree" ("org_id", "email_norm");

CREATE INDEX IF NOT EXISTS "idx_personal_org_id" ON "public"."personal" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_personal_user_id" ON "public"."personal" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_personal_vigente" ON "public"."personal" USING "btree" ("vigente");

CREATE INDEX IF NOT EXISTS "idx_pos_geocerca_time" ON "public"."posiciones" USING "btree" ("geocerca_id", "timestamp");

CREATE INDEX IF NOT EXISTS "idx_pos_lltoearth" ON "public"."posiciones" USING "gist" ("public"."ll_to_earth"("lat", "lng"));

CREATE INDEX IF NOT EXISTS "idx_pos_tracker_time" ON "public"."posiciones" USING "btree" ("tracker_id", "timestamp");

CREATE INDEX IF NOT EXISTS "idx_positions_asignacion_time" ON "public"."positions" USING "btree" ("asignacion_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_positions_org_recorded_at" ON "public"."positions" USING "btree" ("org_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_positions_org_time" ON "public"."positions" USING "btree" ("org_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_positions_user_recorded_at" ON "public"."positions" USING "btree" ("user_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_positions_user_time" ON "public"."positions" USING "btree" ("user_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_profiles_active_tenant_id" ON "public"."profiles" USING "btree" ("active_tenant_id");

CREATE INDEX IF NOT EXISTS "idx_ta_org" ON "public"."tracker_assignments" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_ta_org_tracker_active" ON "public"."tracker_assignments" USING "btree" ("org_id", "tracker_user_id", "active");

CREATE INDEX IF NOT EXISTS "idx_ta_tracker_range" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "start_date", "end_date");

CREATE INDEX IF NOT EXISTS "idx_tracker_assignments_activity_id" ON "public"."tracker_assignments" USING "btree" ("activity_id");

CREATE INDEX IF NOT EXISTS "idx_tracker_assignments_geofence" ON "public"."tracker_assignments" USING "btree" ("geofence_id");

CREATE INDEX IF NOT EXISTS "idx_tracker_assignments_tenant_active" ON "public"."tracker_assignments" USING "btree" ("tenant_id", "active");

CREATE INDEX IF NOT EXISTS "idx_tracker_assignments_tenant_tracker_active" ON "public"."tracker_assignments" USING "btree" ("tenant_id", "tracker_user_id", "active");

CREATE INDEX IF NOT EXISTS "idx_tracker_locations_org_created_at" ON "public"."tracker_locations" USING "btree" ("org_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_tracker_locations_tracker_created_at" ON "public"."tracker_locations" USING "btree" ("tracker_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_tracker_logs_geom" ON "public"."tracker_logs" USING "gist" ("geom");

CREATE INDEX IF NOT EXISTS "idx_tracker_logs_org" ON "public"."tracker_logs" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_tracker_logs_ts_desc" ON "public"."tracker_logs" USING "btree" ("ts" DESC);

CREATE INDEX IF NOT EXISTS "idx_tracker_logs_user" ON "public"."tracker_logs" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_tracker_logs_user_ts" ON "public"."tracker_logs" USING "btree" ("user_id", "ts" DESC);

CREATE INDEX IF NOT EXISTS "idx_tracker_positions_user_id" ON "public"."tracker_positions" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_user_organizations_org_id" ON "public"."user_organizations" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_user_organizations_user_id" ON "public"."user_organizations" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_user_orgs_org" ON "public"."user_orgs" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_user_orgs_user" ON "public"."user_orgs" USING "btree" ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_usuarios_phone_e164_unique" ON "public"."usuarios" USING "btree" ("phone_e164") WHERE ("phone_e164" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "invitations_org_idx" ON "public"."invitations" USING "btree" ("org_id");

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_pending_unique" ON "public"."invitations" USING "btree" ("org_id", "email") WHERE ("status" = 'pending'::"public"."invite_status");

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_key" ON "public"."invitations" USING "btree" ("token");

CREATE INDEX IF NOT EXISTS "ix_pending_invites_email_lower" ON "public"."pending_invites" USING "btree" ("lower"("email"));

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_one_default_per_user" ON "public"."memberships" USING "btree" ("user_id") WHERE ("is_default" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_one_default_per_user_uk" ON "public"."memberships" USING "btree" ("user_id") WHERE ("is_default" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_org_user_role_uk" ON "public"."memberships" USING "btree" ("org_id", "user_id", "role");

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_org_uniq" ON "public"."memberships" USING "btree" ("user_id", "org_id");

CREATE INDEX IF NOT EXISTS "org_invites_email_idx" ON "public"."org_invites" USING "btree" ("lower"("email"));

CREATE INDEX IF NOT EXISTS "org_invites_org_id_idx" ON "public"."org_invites" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "org_invites_pending_idx" ON "public"."org_invites" USING "btree" ("org_id", "lower"("email")) WHERE (("accepted_at" IS NULL) AND ("revoked_at" IS NULL));

CREATE INDEX IF NOT EXISTS "org_invites_status_idx" ON "public"."org_invites" USING "btree" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "org_members_org_user_uniq" ON "public"."org_members" USING "btree" ("org_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "org_people_org_person_uniq" ON "public"."org_people" USING "btree" ("org_id", "person_id");

CREATE UNIQUE INDEX IF NOT EXISTS "org_people_unique_active" ON "public"."org_people" USING "btree" ("org_id", "person_id") WHERE ("is_deleted" = false);

CREATE INDEX IF NOT EXISTS "org_tenant_map_tenant_idx" ON "public"."org_tenant_map" USING "btree" ("tenant_id");

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "public"."organizations" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "organizations_suspended_true_idx" ON "public"."organizations" USING "btree" ("id") WHERE ("suspended" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "people_unique_documento" ON "public"."people" USING "btree" ("documento_norm") WHERE ("documento_norm" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "people_unique_email" ON "public"."people" USING "btree" ("email_norm") WHERE ("email_norm" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "people_unique_phone" ON "public"."people" USING "btree" ("phone_norm") WHERE ("phone_norm" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "personal_created_at_idx" ON "public"."personal" USING "btree" ("created_at");

CREATE INDEX IF NOT EXISTS "personal_email_idx" ON "public"."personal" USING "btree" ("email");

CREATE INDEX IF NOT EXISTS "personal_fingerprint_idx" ON "public"."personal" USING "btree" ("fingerprint");

CREATE INDEX IF NOT EXISTS "personal_org_email_idx" ON "public"."personal" USING "btree" ("org_id", "lower"("email"));

CREATE INDEX IF NOT EXISTS "personal_org_owner_tracker_idx" ON "public"."personal" USING "btree" ("org_id") WHERE (("owner_id" IS NOT NULL) AND (COALESCE("is_deleted", false) = false));

CREATE INDEX IF NOT EXISTS "personal_org_tracker_idx" ON "public"."personal" USING "btree" ("org_id") WHERE (("position_interval_sec" IS NOT NULL) AND ("position_interval_sec" > 0) AND (COALESCE("is_deleted", false) = false));

CREATE INDEX IF NOT EXISTS "personal_org_vigente_idx" ON "public"."personal" USING "btree" ("org_id", "is_deleted", "vigente");

CREATE INDEX IF NOT EXISTS "personal_owner_id_idx" ON "public"."personal" USING "btree" ("owner_id");

CREATE UNIQUE INDEX IF NOT EXISTS "personal_unique_active_email" ON "public"."personal" USING "btree" ("org_id", "email_norm") WHERE ((COALESCE("is_deleted", false) = false) AND ("email_norm" IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "personal_unique_active_identity" ON "public"."personal" USING "btree" ("org_id", "identity_key") WHERE ((COALESCE("is_deleted", false) = false) AND ("identity_key" IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "personal_unique_active_per_org" ON "public"."personal" USING "btree" ("org_id", "lower"("email"), "telefono_norm") WHERE ("is_deleted" = false);

CREATE UNIQUE INDEX IF NOT EXISTS "personal_unique_active_phone" ON "public"."personal" USING "btree" ("org_id", "phone_norm") WHERE ((COALESCE("is_deleted", false) = false) AND ("phone_norm" IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "personal_unique_fingerprint_active" ON "public"."personal" USING "btree" ("org_id", "fingerprint") WHERE (("is_deleted" = false) AND ("vigente" = true));

CREATE INDEX IF NOT EXISTS "profiles_created_at_desc_idx" ON "public"."profiles" USING "btree" ("created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "profiles_email_unique" ON "public"."profiles" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "profiles_role_idx" ON "public"."profiles" USING "btree" ("role_id");

CREATE INDEX IF NOT EXISTS "tracker_assignments_active_idx" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "tenant_id", "active", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "tracker_assignments_period_tstz_gist" ON "public"."tracker_assignments" USING "gist" ("period_tstz");

CREATE INDEX IF NOT EXISTS "tracker_invites_email_norm_idx" ON "public"."tracker_invites" USING "btree" ("email_norm");

CREATE INDEX IF NOT EXISTS "tracker_invites_expires_at_idx" ON "public"."tracker_invites" USING "btree" ("expires_at");

CREATE INDEX IF NOT EXISTS "tracker_invites_lookup_active_idx" ON "public"."tracker_invites" USING "btree" ("org_id", "email_norm", "is_active", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "tracker_invites_one_active_per_org_email_ux" ON "public"."tracker_invites" USING "btree" ("org_id", "email_norm") WHERE ("is_active" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "tracker_invites_one_pending_per_org_email_ux" ON "public"."tracker_invites" USING "btree" ("org_id", "email_norm") WHERE ("used_at" IS NULL);

CREATE INDEX IF NOT EXISTS "tracker_invites_org_id_idx" ON "public"."tracker_invites" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "tracker_logs_tenant_received_idx" ON "public"."tracker_logs" USING "btree" ("tenant_id", "received_at" DESC);

CREATE INDEX IF NOT EXISTS "tracker_logs_user_received_idx" ON "public"."tracker_logs" USING "btree" ("user_id", "received_at" DESC);

CREATE INDEX IF NOT EXISTS "tracker_positions_user_created_at_idx" ON "public"."tracker_positions" USING "btree" ("user_id", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_asig_person_geofence" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "geofence_id") WHERE ("end_date" IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_geofences_one_default_per_org" ON "public"."geofences" USING "btree" ("org_id") WHERE ("is_default" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_personal_org_documento" ON "public"."personal" USING "btree" ("org_id", "lower"("documento")) WHERE (("documento" IS NOT NULL) AND ("documento" <> ''::"text"));

CREATE UNIQUE INDEX IF NOT EXISTS "uq_personal_org_email_active" ON "public"."personal" USING "btree" ("org_id", "lower"("email")) WHERE ((COALESCE("is_deleted", false) = false) AND ("email" IS NOT NULL) AND ("email" <> ''::"text"));

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tracker_assignments_unique" ON "public"."tracker_assignments" USING "btree" ("tenant_id", "tracker_user_id", "geofence_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_geofences_org_source_geocerca" ON "public"."geofences" USING "btree" ("org_id", "source_geocerca_id") WHERE ("source_geocerca_id" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_memberships_one_default_per_user" ON "public"."memberships" USING "btree" ("user_id") WHERE ("is_default" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_memberships_user_org_active" ON "public"."memberships" USING "btree" ("user_id", "org_id") WHERE ("revoked_at" IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_organizations_one_personal_per_owner" ON "public"."organizations" USING "btree" ("owner_id") WHERE ("is_personal" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_pending_invites_active" ON "public"."pending_invites" USING "btree" ("lower"("email"), "role", COALESCE("target_org_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE (("status" = 'pending'::"text") AND ("email" IS NOT NULL) AND ("role" IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "ux_pending_invites_claim_code_active" ON "public"."pending_invites" USING "btree" ("claim_code") WHERE ("status" = 'pending'::"text");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_personal_org_user_active" ON "public"."personal" USING "btree" ("org_id", "user_id") WHERE ((COALESCE("is_deleted", false) = false) AND ("user_id" IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "ux_ta_one_active_per_tracker_org" ON "public"."tracker_assignments" USING "btree" ("org_id", "tracker_user_id") WHERE ("active" IS TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_tracker_assignments_active" ON "public"."tracker_assignments" USING "btree" ("tracker_user_id", "geofence_id") WHERE ("active" IS TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_tracker_latest_user" ON "public"."tracker_latest" USING "btree" ("user_id");

ALTER TABLE "public"."memberships" DISABLE TRIGGER "trg_ensure_org_for_new_admin";

ALTER TABLE "public"."memberships" DISABLE TRIGGER "trg_membership_audit";

ALTER TABLE "public"."personal" DISABLE TRIGGER "trg_prevent_personal_duplicate_on_undelete";

ALTER TABLE "public"."memberships" DISABLE TRIGGER "zzz_one_admin_memberships";

ALTER TABLE "public"."personal" DISABLE TRIGGER "zzz_personal_biu_defaults";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_assignments' AND c.conname='activity_assignments_activity_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."activity_assignments" ADD CONSTRAINT "activity_assignments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_assignments' AND c.conname='activity_assignments_tenant_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."activity_assignments" ADD CONSTRAINT "activity_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_assignments' AND c.conname='activity_assignments_tracker_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."activity_assignments" ADD CONSTRAINT "activity_assignments_tracker_user_id_fkey" FOREIGN KEY ("tracker_user_id") REFERENCES "public"."users_public"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_rates' AND c.conname='activity_rates_activity_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."activity_rates" ADD CONSTRAINT "activity_rates_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='activity_rates' AND c.conname='activity_rates_tenant_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."activity_rates" ADD CONSTRAINT "activity_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_root_users' AND c.conname='app_root_users_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_root_users" ADD CONSTRAINT "app_root_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='app_user_roles' AND c.conname='app_user_roles_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."app_user_roles" ADD CONSTRAINT "app_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_activity_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_geocerca_fk'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_geocerca_fk" FOREIGN KEY ("geocerca_id") REFERENCES "public"."geocercas"("id") ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_org_people_fk'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_org_people_fk" FOREIGN KEY ("org_people_id") REFERENCES "public"."org_people"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_personal_fk'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_personal_fk" FOREIGN KEY ("personal_id") REFERENCES "public"."personal"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asignaciones' AND c.conname='asignaciones_tenant_fk'
  ) THEN
    ALTER TABLE ONLY "public"."asignaciones" ADD CONSTRAINT "asignaciones_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='asistencias' AND c.conname='asistencias_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."asistencias" ADD CONSTRAINT "asistencias_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='attendance_events' AND c.conname='attendance_events_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."attendance_events" ADD CONSTRAINT "attendance_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='attendance_events' AND c.conname='attendance_events_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."attendance_events" ADD CONSTRAINT "attendance_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='audit_log' AND c.conname='audit_log_actor_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."audit_log" ADD CONSTRAINT "audit_log_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_organizations' AND c.conname='fk_user_org_organization'
  ) THEN
    ALTER TABLE ONLY "public"."user_organizations" ADD CONSTRAINT "fk_user_org_organization" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geocercas' AND c.conname='geocercas_org_fk'
  ) THEN
    ALTER TABLE ONLY "public"."geocercas" ADD CONSTRAINT "geocercas_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geocercas_tbl' AND c.conname='geocercas_owner_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."geocercas_tbl" ADD CONSTRAINT "geocercas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofence_assignments' AND c.conname='geofence_assignments_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofence_assignments" ADD CONSTRAINT "geofence_assignments_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofence_events' AND c.conname='geofence_events_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofence_events" ADD CONSTRAINT "geofence_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofence_members' AND c.conname='geofence_members_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."geofence_members" ADD CONSTRAINT "geofence_members_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofences' AND c.conname='geofences_org_fk'
  ) THEN
    ALTER TABLE ONLY "public"."geofences" ADD CONSTRAINT "geofences_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='geofences' AND c.conname='geofences_user_fk'
  ) THEN
    ALTER TABLE ONLY "public"."geofences" ADD CONSTRAINT "geofences_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='invitations' AND c.conname='invitations_invited_by_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='invitations' AND c.conname='invitations_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."invitations" ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='memberships' AND c.conname='memberships_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."memberships" ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='memberships' AND c.conname='memberships_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_billing' AND c.conname='org_billing_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_billing" ADD CONSTRAINT "org_billing_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_members' AND c.conname='org_members_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_members' AND c.conname='org_members_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_members" ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_people' AND c.conname='org_people_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_people" ADD CONSTRAINT "org_people_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_people' AND c.conname='org_people_person_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_people" ADD CONSTRAINT "org_people_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='org_users' AND c.conname='org_users_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."org_users" ADD CONSTRAINT "org_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='organizations' AND c.conname='organizations_created_by_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."organizations" ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='organizations' AND c.conname='organizations_owner_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='pending_invites' AND c.conname='pending_invites_role_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."pending_invites" ADD CONSTRAINT "pending_invites_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='personal' AND c.conname='personal_owner_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."personal" ADD CONSTRAINT "personal_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='personal' AND c.conname='personal_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."personal" ADD CONSTRAINT "personal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='posiciones' AND c.conname='posiciones_geocerca_fk'
  ) THEN
    ALTER TABLE ONLY "public"."posiciones" ADD CONSTRAINT "posiciones_geocerca_fk" FOREIGN KEY ("geocerca_id") REFERENCES "public"."geocercas"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='posiciones' AND c.conname='posiciones_tracker_fk'
  ) THEN
    ALTER TABLE ONLY "public"."posiciones" ADD CONSTRAINT "posiciones_tracker_fk" FOREIGN KEY ("tracker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='position_events' AND c.conname='position_events_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."position_events" ADD CONSTRAINT "position_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='position_events' AND c.conname='position_events_tenant_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."position_events" ADD CONSTRAINT "position_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='position_events' AND c.conname='position_events_tracker_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."position_events" ADD CONSTRAINT "position_events_tracker_user_id_fkey" FOREIGN KEY ("tracker_user_id") REFERENCES "public"."users_public"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='profiles' AND c.conname='profiles_current_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_current_org_id_fkey" FOREIGN KEY ("current_org_id") REFERENCES "public"."organizations"("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='profiles' AND c.conname='profiles_default_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_default_org_id_fkey" FOREIGN KEY ("default_org_id") REFERENCES "public"."organizations"("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='profiles' AND c.conname='profiles_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='profiles' AND c.conname='profiles_org_fk'
  ) THEN
    ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='profiles' AND c.conname='profiles_role_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='tracker_assignments_activity_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "tracker_assignments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='tracker_assignments_geofence_fk'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "tracker_assignments_geofence_fk" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='tracker_assignments_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "tracker_assignments_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='tracker_assignments_tenant_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "tracker_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_assignments' AND c.conname='tracker_assignments_tracker_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_assignments" ADD CONSTRAINT "tracker_assignments_tracker_user_id_fkey" FOREIGN KEY ("tracker_user_id") REFERENCES "public"."users_public"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_invites' AND c.conname='tracker_invites_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_invites" ADD CONSTRAINT "tracker_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_positions' AND c.conname='tracker_positions_geocerca_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_positions" ADD CONSTRAINT "tracker_positions_geocerca_id_fkey" FOREIGN KEY ("geocerca_id") REFERENCES "public"."geofences"("id") ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='tracker_positions' AND c.conname='tracker_positions_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."tracker_positions" ADD CONSTRAINT "tracker_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_geofence_state' AND c.conname='user_geofence_state_geofence_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_geofence_state" ADD CONSTRAINT "user_geofence_state_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_organizations' AND c.conname='user_organizations_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_organizations" ADD CONSTRAINT "user_organizations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_organizations' AND c.conname='user_organizations_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_organizations" ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_orgs' AND c.conname='user_orgs_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_orgs" ADD CONSTRAINT "user_orgs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_profiles' AND c.conname='user_profiles_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_profiles" ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_roles' AND c.conname='user_roles_role_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='user_roles' AND c.conname='user_roles_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='users_public' AND c.conname='users_public_tenant_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."users_public" ADD CONSTRAINT "users_public_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname='usuarios' AND c.conname='usuarios_id_fkey'
  ) THEN
    ALTER TABLE ONLY "public"."usuarios" ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END$$;
