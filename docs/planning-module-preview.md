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

## Fase 4 — Conexión read-only en Preview

La página `src/pages/Planificacion.jsx` fue conectada en modo solo lectura a Supabase Preview.

Consulta:
- `public.planning_items`
- `public.geofences`
- `public.activities`

Reglas:
- No inserta datos.
- No actualiza datos.
- No borra datos.
- Usa `currentOrg` desde `useAuth()`.
- Muestra estado vacío cuando no hay planificación registrada.
- Si falla la consulta, muestra advertencia y mantiene respaldo visual demo local.

Estado visual validado:
- `/planificacion` muestra “Datos reales Preview”.
- La tabla muestra empty state cuando `planning_items` no tiene registros.
- Producción no fue tocada.

## Fix Preview — Organización activa y Planificación

Durante la validación de Planificación se detectó que el servidor podía devolver una organización activa antigua con rol `viewer/tracker`, pisando una organización válida elegida por el usuario.

Se ajustó `AuthContext` para que `preferredOrgId` válido desde `localStorage` tenga prioridad sobre `serverOrgId`, siempre que la organización no sea tracker.

Esto permite probar módulos de gestión como Planificación con una organización `owner/admin` válida sin relajar RLS.

No se modificó RLS.
No se permitió acceso a `viewer` ni `tracker`.

## Validación Preview — Días calendario

Se validó que el módulo Planificación usa días calendario completos de lunes a domingo.

Prueba realizada:
- B1 / Poda del 2026-06-15 al 2026-06-19.
- B1 / Poda del 2026-06-20 al 2026-06-21.

Resultado:
- La primera planificación se muestra de lunes a viernes.
- La segunda planificación se muestra en sábado y domingo.
- Producción no fue tocada.

## Tabla read-only — Campos visibles en `/planificacion`

Se dejó documentado que la vista `/planificacion` en Preview ya muestra en tabla read-only:

- Fecha inicio
- Fecha fin
- Horas planificadas
- Costo planificado
- Estado
- Vista temporal Lun-Dom

## Fase 5 — Formulario visual Nueva planificación

Se agregó en Preview un formulario visual para crear planificación operativa.

Campos visibles:
- Geocerca
- Actividad
- Fecha inicio
- Fecha fin
- Horas planificadas
- Costo planificado
- Estado
- Notas

Estado actual:
- El formulario es solo visual.
- No ejecuta `insert`.
- No ejecuta `update`.
- No ejecuta `delete`.
- No ejecuta `upsert`.
- No ejecuta `rpc`.
- El botón de guardado aparece como “Guardar próximamente”.

Objetivo:
Validar UX antes de habilitar escritura real en `public.planning_items`.

Producción no fue tocada.

## Fase 6 — Validación local del formulario

Se agregó validación local al formulario visual de Nueva planificación.

Validaciones:
- Geocerca requerida.
- Actividad requerida.
- Fecha inicio requerida.
- Fecha fin requerida.
- Fecha fin no puede ser anterior a fecha inicio.
- Horas planificadas deben ser mayores o iguales a 0.
- Costo planificado debe ser mayor o igual a 0.
- Estado debe ser uno de: draft, approved, closed, archived.

Estado actual:
- La validación ocurre solo en frontend.
- No ejecuta insert.
- No ejecuta update.
- No ejecuta delete.
- No ejecuta upsert.
- No ejecuta rpc.
- El botón muestra validación local, sin persistencia backend.

Producción no fue tocada.

## Fase 7 — Guardado real en `planning_items`

Se habilitó en Preview el guardado real de nuevas planificaciones desde `src/pages/Planificacion.jsx`.

Flujo implementado:

- El usuario selecciona geocerca.
- El usuario selecciona actividad.
- El usuario ingresa fechas.
- El usuario ingresa horas planificadas.
- El costo planificado se calcula automáticamente usando `activities.hourly_rate`.
- Si la actividad no tiene tarifa, el costo puede ingresarse manualmente.
- Se ejecuta un único `insert` en `public.planning_items`.
- Después del guardado, la lista se recarga con `loadPlanningData`.
- El formulario se limpia.
- La nueva planificación aparece en tabla y Gantt.

Reglas de seguridad:

- No se agregó `update`.
- No se agregó `delete`.
- No se agregó `upsert`.
- No se agregó `rpc`.
- La escritura queda protegida por RLS owner/admin de `planning_items`.
- `tracker` y `viewer` no tienen acceso.

Validación Preview:

- Se guardó una planificación real desde formulario.
- La tabla pasó de 2 a 3 tareas.
- El Gantt mostró la nueva planificación.
- Producción no fue tocada.
