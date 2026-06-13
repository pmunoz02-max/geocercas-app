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

## Fase 8 — Archivado lógico de planificación

Se habilitó en Preview la acción "Archivar" en la tabla de planificación.

Flujo implementado:

- Cada fila de planificación muestra una acción "Archivar".
- Al archivar, se pide confirmación al usuario.
- No se ejecuta delete físico.
- Se ejecuta un update lógico sobre `public.planning_items`.
- Se actualiza `status = 'archived'`.
- Se actualiza `archived_at = now`.
- Después del archivado, la lista se recarga con `loadPlanningData`.
- Como la consulta activa filtra `archived_at is null`, la fila archivada desaparece de la tabla y del Gantt.

Validación Preview:

- Se archivó una planificación de prueba.
- La fila desapareció de la tabla activa.
- El Gantt se recargó sin esa planificación.
- La consulta SQL confirmó que el registro sigue existiendo con `status = archived` y `archived_at` no nulo.

Reglas de seguridad:

- No se agregó delete.
- No se agregó upsert.
- No se agregó rpc.
- El archivado usa update controlado por `id` y `org_id`.
- RLS owner/admin sigue protegiendo la escritura.
- Producción no fue tocada.
## Fase 9A — Vista de planificaciones archivadas

Se habilitó en Preview la visualización de planificaciones archivadas en modo solo lectura.

Flujo implementado:

* La página `/planificacion` muestra por defecto las planificaciones activas.
* Se agregó un botón para alternar entre:

  * `Planificaciones activas`
  * `Planificaciones archivadas`
* En modo activas, la consulta carga registros con `archived_at is null`.
* En modo archivadas, la consulta carga registros con `archived_at not null`.
* La tabla cambia su título y mensaje según el modo seleccionado.
* El Gantt se sincroniza con el modo actual.
* En modo archivadas no se muestra el formulario de nueva planificación.
* En modo archivadas no se muestra el botón `Archivar`.

Reglas de seguridad:

* No se agregó `delete`.
* No se agregó `upsert`.
* No se agregó `rpc`.
* Se mantiene un único `insert` para crear planificación.
* Se mantiene un único `update` para archivar planificación.
* La vista de archivadas es solo lectura.
* Producción no fue tocada.

Validación Preview:

* La página carga inicialmente planificaciones activas.
* El botón `Ver archivadas` muestra el historial archivado.
* La planificación archivada aparece correctamente.
* El formulario de nueva planificación se oculta en modo archivadas.
* La acción `Archivar` no aparece en modo archivadas.
* El botón `Ver activas` regresa correctamente a las planificaciones activas.
## Fase 9B — Restaurar planificación archivada

Se habilitó en Preview la acción para restaurar planificaciones archivadas.

Flujo implementado:

* El usuario entra a `/planificacion`.
* Selecciona `Ver archivadas`.
* Cada planificación archivada muestra la acción `Restaurar`.
* Al restaurar, se pide confirmación al usuario.
* No se ejecuta delete físico.
* No se ejecuta upsert.
* No se ejecuta rpc.
* Se ejecuta un update lógico sobre `public.planning_items`.
* La restauración actualiza:

  * `status = 'draft'`
  * `archived_at = null`
* Después de restaurar, la lista archivada se recarga.
* La planificación desaparece de archivadas.
* Al volver a `Ver activas`, la planificación restaurada aparece como borrador.

Reglas de seguridad:

* Se mantiene un único `insert` para crear planificación.
* Se mantienen dos `update` controlados:

  * Archivar planificación.
  * Restaurar planificación.
* No existe `delete` físico desde la app.
* RLS owner/admin sigue protegiendo la escritura.
* `tracker` y `viewer` no tienen acceso.
* Producción no fue tocada.

Validación Preview:

* Se restauró una planificación archivada.
* La alerta de éxito apareció correctamente.
* La planificación desapareció de la vista archivada.
* La planificación reapareció en la vista activa como `draft`.
## Fase 10A — UI de edición de planificación activa

Se habilitó en Preview la interfaz visual para editar planificaciones activas.

Flujo implementado:

* En la tabla de planificaciones activas se agregó la acción `Editar`.
* Al hacer clic en `Editar`, el formulario cambia de `Nueva planificación` a `Editar planificación`.
* El formulario se precarga con:

  * Geocerca
  * Actividad
  * Fecha inicio
  * Fecha fin
  * Horas planificadas
  * Costo planificado
  * Estado
  * Notas
* El botón cambia a `Guardar edición próximamente`.
* La edición real todavía no guarda cambios en backend.
* Al hacer clic en `Cancelar`, el formulario vuelve a modo `Nueva planificación`.

Reglas de seguridad:

* No se agregó ningún update nuevo para edición.
* Se mantiene un único `insert` para crear planificación.
* Se mantienen dos `update` existentes:

  * Archivar planificación.
  * Restaurar planificación.
* No se agregó delete.
* No se agregó upsert.
* No se agregó rpc.
* Producción no fue tocada.

Validación Preview:

* El formulario se prellenó correctamente desde una planificación activa.
* El modo edición visual se activó correctamente.
* Cancelar volvió al modo nueva planificación.
* No se guardaron cambios todavía.
## Fase 10B — Guardar edición real de planificación activa

Se habilitó en Preview el guardado real de ediciones sobre planificaciones activas.

Flujo implementado:

* El usuario entra a `/planificacion`.
* En una planificación activa, hace clic en `Editar`.
* El formulario se precarga con los datos existentes.
* El usuario puede modificar:

  * Geocerca
  * Actividad
  * Fecha inicio
  * Fecha fin
  * Horas planificadas
  * Costo planificado
  * Estado
  * Notas
* Al guardar, se ejecuta un `update` controlado sobre `public.planning_items`.
* El update se filtra por:

  * `id = editingPlanningId`
  * `org_id = orgId`
* Se actualiza `updated_at`.
* Después de guardar, la lista se recarga.
* El formulario vuelve al modo `Nueva planificación`.
* El Gantt refleja las fechas actualizadas.

Reglas de seguridad:

* Se mantiene un único `insert` para crear planificación.
* Se mantienen tres `update` controlados:

  * Archivar planificación.
  * Restaurar planificación.
  * Editar planificación.
* No se agregó delete.
* No se agregó upsert.
* No se agregó rpc.
* RLS owner/admin sigue protegiendo la escritura.
* `tracker` y `viewer` no tienen acceso.
* Producción no fue tocada.

Validación Preview:

* Se editó una planificación activa.
* La alerta `Planificación actualizada correctamente` apareció.
* La tabla se recargó con los cambios.
* El Gantt reflejó las fechas actualizadas.
## Fase 11A — Plan vs Real básico

Se habilitó en Preview la primera comparación básica entre planificación operativa y ejecución real.

Fuentes utilizadas:

* Planificado: `public.planning_items`
* Real: `public.v_costos_hybrid_preview`

Criterio de comparación inicial:

* Misma organización: `org_id`
* Misma geocerca canónica: `geofence_id`
* Misma actividad: `activity_id`
* Fecha real dentro del período planificado:

  * `start_date`
  * `end_date`

Campos agregados a la tabla de planificación:

* Horas reales
* Costo real
* Diferencia de horas
* Diferencia de costo

Reglas de cálculo:

* `horasReales` suma las horas reales coincidentes.
* `costoReal` suma `costo_final` y usa `costo_base` como respaldo.
* `diferenciaHoras = horasReales - horasPlanificadas`.
* `diferenciaCosto = costoReal - costoPlanificado`.
* Las planificaciones sin ejecución real muestran `0.00` en horas reales y costo real.

Reglas de seguridad:

* No se agregó nueva escritura.
* Se mantiene un único `insert` para crear planificación.
* Se mantienen tres `update` controlados:

  * Archivar planificación.
  * Restaurar planificación.
  * Editar planificación.
* No se agregó delete.
* No se agregó upsert.
* No se agregó rpc.
* La consulta a `v_costos_hybrid_preview` es solo lectura.
* Producción no fue tocada.

Validación Preview:

* La tabla mostró las nuevas columnas de Plan vs Real.
* Las planificaciones sin ejecución real mostraron valores reales en `0.00`.
* Las planificaciones coincidentes con `v_costos_hybrid_preview` mostraron valores reales.
* El Gantt siguió funcionando.
* Crear, editar, archivar y restaurar siguieron funcionando correctamente.
