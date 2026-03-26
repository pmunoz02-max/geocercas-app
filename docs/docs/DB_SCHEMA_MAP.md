# DB Schema Map

Mapa de esquema de base de datos para `geocercas-app` (Supabase/PostgreSQL).

## Fuentes usadas

- Esquema consolidado: `_archive/prod_public_schema.sql`
- Migraciones activas: `supabase/migrations/`
- SQL operativo/demo: `supabase/sql/`
- Uso real en app/API: `api/`, `src/`, `server/`

## Convenciones del mapa

- `Canonica`: objeto que se usa activamente en API/UI actual.
- `Compat/Legacy`: objeto historico o de compatibilidad que aun aparece en codigo.
- Multi-tenant principal por `org_id` (con compatibilidad historica en `tenant_id`).

## Dominios y objetos

### 1) Identidad y organizaciones

#### `public.organizations` (Canonica)

- Proposito: entidad tenant principal.
- PK: `id`
- Campos clave: `name`, `slug`, `owner_id`, `plan`, `active`, `suspended`, `is_personal`
- Relaciones:
- `memberships.org_id -> organizations.id`
- `geocercas.org_id -> organizations.id`
- `geofences.org_id -> organizations.id`
- `personal.org_id -> organizations.id`
- `asignaciones.org_id -> organizations.id`

#### `public.memberships` (Canonica)

- Proposito: membresia usuario-org con rol.
- PK logica: `(org_id, user_id)`
- Campos clave: `role` (`owner|admin|tracker|viewer`), `is_default`, `revoked_at`
- Uso: base de control de acceso por organizacion.

#### `public.profiles` (Canonica)

- Proposito: perfil app del usuario autenticado.
- PK: `id` (normalmente `auth.users.id`)
- Campos clave: `email`, `full_name`, `org_id`, `default_org_id`, `current_org_id`, `role`
- Uso: contexto de organizacion activa y datos de UI.

#### Objetos de soporte relacionados

- `public.roles` (catalogo de roles UI/admin)
- `public.user_organizations` (compat/legacy en algunas pantallas)
- `public.org_members`, `public.org_users` (variantes historicas de membresia)
- `public.org_invites`, `public.invitations`, `public.pending_invites`, `public.tracker_invites`

### 2) Personal

#### `public.personal` (Canonica)

- Proposito: trabajadores/personas operativas por organizacion.
- PK: `id`
- Campos clave:
- Identidad: `nombre`, `apellido`, `email`, `email_norm`, `telefono`, `phone_norm`, `documento`
- Estado: `vigente`, `activo`, `is_deleted`, `deleted_at`
- Contexto: `org_id`, `owner_id`, `user_id`, `position_interval_sec`
- Reglas notables:
- Soft delete (`is_deleted`)
- Normalizacion de identidad (`identity_key` generado)
- Intervalo minimo de envio (`position_interval_sec >= 300`)

#### `public.org_people` (Canonica en flujos nuevos)

- Proposito: relacion persona-organizacion normalizada.
- PK: `id`
- Campos clave: `org_id`, `person_id`, `vigente`, `is_deleted`

### 3) Geocercas

#### `public.geocercas` (Canonica en gran parte del frontend/API)

- Proposito: geocercas historicas y operativas.
- PK: `id`
- Campos clave: `org_id`, `nombre`/`name`, `geojson`, `geom` (jsonb), `bbox`, `lat`, `lng`, `radius_m`, `active|activa|activo`, `is_deleted`
- Observacion: coexistencia de columnas heredadas y nuevas.

#### `public.geofences` (Canonica en tracker/dashboard moderno)

- Proposito: geocercas normalizadas con PostGIS.
- PK: `id`
- Campos clave: `org_id`, `name`, `geojson`, `geom` (geometry MultiPolygon), `lat`, `lng`, `radius_m`, `active`, `source_geocerca_id`
- Reglas notables:
- CHECK de forma (`polygon_geojson` o `lat/lng/radius`)
- Bounding box generado (`bbox`)

#### Puentes y vistas de compatibilidad

- `public.geofence_assignments`
- `public.geocerca_geofence_map`
- Vistas: `geocercas_feature`, `geocercas_geojson`, `geofences_compat`, `geofences_geojson`, `v_geofences_ui`, `v_geofences_active_ui`

### 4) Asignaciones y costos

#### `public.asignaciones` (Canonica)

- Proposito: asignacion persona-geocerca-actividad con ventana temporal.
- PK: `id`
- Campos clave:
- Referencias: `org_id`, `personal_id`, `org_people_id`, `geocerca_id`, `geofence_id`, `activity_id`
- Tiempo/estado: `start_date`, `end_date`, `period` (daterange), `start_time`, `end_time`, `estado`, `status`, `is_deleted`
- Frecuencia: `frecuencia_envio_sec`, `frequency_minutes`
- Reglas notables:
- Validacion de rango de fechas
- Soft delete

#### `public.activities` (Canonica)

- Proposito: catalogo de actividades para costos y planeacion.
- PK: `id`
- Campos clave: `org_id`, `tenant_id`, `name`, `active`, `hourly_rate`, `currency_code`

#### `public.activity_assignments` (Canonica en modulo costos)

- Proposito: asignacion directa tracker-actividad por fechas.
- PK: `id`
- Campos clave: `tenant_id`, `tracker_user_id`, `activity_id`, `start_date`, `end_date`

#### Vistas de costos/reportes

- `public.v_costos_detalle`, `public.v_costos_detalle_v2`
- `public.v_reportes_diario`, `public.v_reportes_diario_con_asignacion`

### 5) Tracking y asistencia

#### `public.tracker_positions` (Compat/legacy, aun usada)

- Proposito: posiciones GPS basicas por tracker.
- PK: `id`
- Campos clave: `user_id`, `geocerca_id`, `latitude`, `longitude`, `accuracy`, `speed`, `created_at`

#### `public.positions` (Canonica para pipeline nuevo)

- Proposito: ingesta de posiciones enriquecida por org.
- PK: `id`
- Campos clave: `org_id`, `user_id`, `personal_id`, `asignacion_id`, `lat`, `lng`, `recorded_at`, `source`, `battery`, `is_mock`

#### `public.tracker_logs` y `public.tracker_latest` (Canonica para mapas en vivo)

- `tracker_logs`: historico de eventos/ubicaciones.
- `tracker_latest`: ultimo punto por usuario.

#### `public.tracker_assignments` (Canonica)

- Proposito: asignacion de trackers a geofences en periodos activos.
- PK: `id`
- Campos clave: `org_id`, `tracker_user_id`, `geofence_id`, `activity_id`, `start_date`, `end_date`, `period_tstz`, `active`, `frequency_minutes`

#### `public.tracker_geofence_events` (Nueva migracion preview)

- Fuente: `supabase/migrations/20260312120000_tracker_geofence_events.sql`
- Proposito: eventos `ENTER/EXIT` por geocerca.
- Campos clave: `org_id`, `user_id`, `personal_id`, `geocerca_id` (FK a `geofences.id`), `geocerca_nombre`, `event_type`, `lat`, `lng`, `source`, `created_at`
- RLS: lectura limitada a miembros de la misma `org_id`.

#### Asistencia

- Tablas: `attendances`, `asistencias`, `attendance_events`
- Vistas: `v_attendance_last`, `v_attendance_daily`, `v_latest_attendance`

### 6) Billing y configuracion

#### `public.org_billing` (Canonica)

- Proposito: plan y estado de billing por organizacion.
- PK logica: `org_id`
- Campos clave: `plan_code`, `plan_status` (en scripts demo), `tracker_limit_override`, `over_limit`, `updated_at`

#### `public.app_settings` (Canonica)

- Proposito: settings globales de aplicacion.
- PK: `key`
- Campos clave: `value` (jsonb), `updated_at`, `updated_by`

### 7) Vistas clave para UI/API

- Contexto y membresia:
- `v_current_membership`, `my_memberships`, `my_org_ids`, `members_with_profiles`, `user_current_org`
- Personal y geocercas:
- `v_org_people_ui`, `v_personal_activo`, `v_geocercas_tracker_ui`, `v_geofences_ui`
- Costos/reportes:
- `v_costos_detalle`, `v_reportes_diario_con_asignacion`
- Tracking:
- `v_tracker_assignments_ui`, `v_positions_last_per_user`, `v_app_profiles`

## RPC/funciones SQL usadas por la app

### Contexto org y sesion

- `get_current_org_id`
- `current_org_id`
- `set_current_org`
- `ensure_user_context`
- `bootstrap_user_context` (invocada por backend; validar presencia en entorno)

### Organizaciones y membresias

- `create_organization`
- `set_member_role`
- `list_members_with_email`
- `remove_member`

### Invitaciones

- `invite_member`
- `cancel_invitation`
- `accept_invitation`
- `invite_member_by_email`

### Geocercas y admin

- `rpc_crear_geocerca`
- `f_admin_personal`
- `rpc_admin_assign_geocerca`
- `rpc_admin_upsert_phone`
- `admin_assign_role_org`
- `admins_list`
- `admins_remove`

### Costos y tracking demo

- `get_costos_asignaciones`
- `get_costos_asignaciones_v2`
- `resolve_org_for_tracker_dashboard` (referenciada en frontend; validar presencia en entorno)
- `load_demo_preview_dataset` (`supabase/sql/load_demo_preview_dataset.sql`)
- `demo_move_trackers` (`supabase/sql/demo_move_trackers.sql`)

## Relaciones principales (resumen)

- `organizations` 1:N `memberships`
- `organizations` 1:N `personal`
- `organizations` 1:N `geocercas` y 1:N `geofences`
- `personal` 1:N `asignaciones`
- `geocercas/geofences` 1:N `asignaciones` (segun flujo legacy/canonico)
- `activities` 1:N `asignaciones` y 1:N `activity_assignments`
- `tracker_assignments` referencia `geofences`, `activities` y tracker (`personal.user_id`)

## Seguridad (RLS)

- RLS activado en tablas sensibles de dominio (`organizations` relacionadas por membresia, `personal`, `geocercas`, `geofences`, `asignaciones`, `activities`, `positions`, `org_invites`, etc.).
- Patron dominante: acceso por pertenencia a `memberships` de la misma organizacion (`org_id`) y rol (`owner/admin/tracker`).
- Regla adicional: tablas demo como `tracker_geofence_events` tambien restringen por `memberships` activas.

## Notas de consistencia y deuda tecnica

- Coexisten objetos duplicados o de transicion: `geocercas` vs `geofences`, `attendances` vs `asistencias`, `tenant_id` vs `org_id`.
- Algunas referencias de codigo apuntan a objetos que pueden no estar en el dump principal (`resolve_org_for_tracker_dashboard`, `bootstrap_user_context`, `org_entitlements`).
- Recomendacion: mantener este mapa alineado con nuevas migraciones en `supabase/migrations/` y promover un set canonico unico por dominio.
