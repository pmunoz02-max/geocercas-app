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
