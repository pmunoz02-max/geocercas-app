# Módulo Planificación — Preview

## Estado
Implementado en branch preview como UI inicial.

## Alcance actual
- Nueva página: src/pages/Planificacion.jsx
- Nueva ruta protegida: /planificacion
- Nuevo tab interno: Planificación / Planning / Planification
- Requiere organización activa mediante RequireOrg
- Bloqueado para rol tracker

## Lo que NO hace todavía
- No lee Supabase
- No escribe Supabase
- No crea tablas
- No ejecuta SQL
- No compara aún Plan vs Real con datos reales

## Próxima fase
Inspeccionar estructura real de DB antes de diseñar tabla planning_items o equivalente.

## Regla operativa
No promover a Producción hasta validar Preview y recibir orden explícita.

## Fase 2 — Inspección DB Preview

Se confirmó que los nuevos módulos deben usar `public.geofences.id` como FK canónica.

Decisiones:
- `planning_items.geofence_id` deberá apuntar a `public.geofences.id`.
- `planning_items.activity_id` deberá apuntar a `public.activities.id`.
- `planning_items.org_id` deberá apuntar a `public.organizations.id`.
- La fuente preferida para Plan vs Real será `public.v_costos_hybrid_preview`.

Backfill Preview:
- Se detectó 1 asignación legacy con `geocerca_id` pero sin `geofence_id`.
- El puente `public.geocerca_geofence_map` resolvía correctamente hacia `public.geofences.id`.
- Se ejecutó backfill solo en Preview.
- Verificación final: `asignaciones_corregibles_restantes = 0`.

No ejecutar en Production sin orden explícita.

## Fase 3 — Tabla `planning_items` en Preview
Se creó la tabla `public.planning_items` en Supabase Preview para almacenar planificación operativa futura por organización, geocerca canónica, actividad y período.

Relaciones principales:

- `org_id` → `public.organizations.id`
- `geofence_id` → `public.geofences.id`
- `activity_id` → `public.activities.id`
- `created_by` → usuario autenticado vía `auth.uid()`

Campos principales:

- `start_date`
- `end_date`
- `planned_hours`
- `planned_cost`
- `status`
- `notes`
- `created_at`
- `updated_at`
- `archived_at`

Estados permitidos:

- `draft`
- `approved`
- `closed`
- `archived`

Reglas RLS aplicadas:

- `SELECT`: solo usuarios `owner` o `admin` de la organización.
- `INSERT`: solo usuarios `owner` o `admin`.
- `UPDATE`: solo usuarios `owner` o `admin`.
- `DELETE`: bloqueado. El borrado lógico se hará usando `status = 'archived'` y `archived_at`.

Decisión de seguridad:

- El rol `tracker` no tiene acceso a `planning_items`.
- Esta restricción queda protegida por RLS, no solo por frontend.

Índices creados:

- `planning_items_org_idx`
- `planning_items_org_period_idx`
- `planning_items_org_geofence_idx`
- `planning_items_org_activity_idx`
- `planning_items_org_status_idx`
- `planning_items_active_period_idx`

La tabla fue creada solo en Preview. No ejecutar ni promover a Production sin orden explícita.
