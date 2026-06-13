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
## Fase 11B — KPIs Plan vs Real

Se habilitó en Preview un bloque de KPIs generales para comparar planificación operativa contra ejecución real.

Los KPIs se calculan a partir de las filas visibles en el módulo de planificación.

KPIs agregados:

* Horas planificadas
* Horas reales
* Diferencia de horas
* Porcentaje de cumplimiento de horas
* Costo planificado
* Costo real
* Diferencia de costo
* Modo actual: activas o archivadas

Fuente de datos:

* Planificado: `public.planning_items`
* Real: `public.v_costos_hybrid_preview`

Reglas de cálculo:

* `totalHorasPlanificadas`: suma de horas planificadas.
* `totalHorasReales`: suma de horas reales coincidentes.
* `diferenciaHoras = totalHorasReales - totalHorasPlanificadas`.
* `totalCostoPlanificado`: suma de costo planificado.
* `totalCostoReal`: suma de costo real.
* `diferenciaCosto = totalCostoReal - totalCostoPlanificado`.
* `cumplimientoHoras = totalHorasReales / totalHorasPlanificadas * 100`.
* Si no hay horas planificadas, el cumplimiento se muestra como `-`.

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
* La consulta a `v_costos_hybrid_preview` sigue siendo solo lectura.
* Producción no fue tocada.

Validación Preview:

* Los KPIs se mostraron correctamente en `/planificacion`.
* El KPI `Modo actual` cambió correctamente entre activas y archivadas.
* La tabla siguió funcionando.
* El Gantt siguió funcionando.
* Crear, editar, archivar y restaurar siguieron funcionando correctamente.
* Los acentos se visualizaron correctamente en el navegador.
## Fase 11C — Semáforo de desviaciones Plan vs Real

Se habilitó en Preview un semáforo visual para detectar desviaciones entre la planificación operativa y la ejecución real.

Fuente de datos:

* Planificado: `public.planning_items`
* Real: `public.v_costos_hybrid_preview`

Criterio de cálculo:

* Se calcula la desviación porcentual de horas:

  * `abs(horas reales - horas planificadas) / horas planificadas * 100`
* Se calcula la desviación porcentual de costo:

  * `abs(costo real - costo planificado) / costo planificado * 100`
* Se toma como referencia la peor desviación entre horas y costo.

Semáforo implementado:

* 🟢 En rango: desviación hasta 10%.
* 🟡 Desviación moderada: desviación mayor a 10% y hasta 25%.
* 🔴 Desviación alta: desviación mayor a 25%.
* ⚪ Sin base: no hay base planificada suficiente para calcular desviación.

Cambios visuales:

* Se agregó la columna `Semáforo` en la tabla de planificación.
* La tabla pasó a 14 columnas.
* El estado del semáforo se muestra por cada planificación.
* El detalle de desviación queda disponible como descripción del indicador.

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
* La consulta a `v_costos_hybrid_preview` sigue siendo solo lectura.
* Producción no fue tocada.

Validación Preview:

* La columna `Semáforo` apareció correctamente.
* Se visualizaron los estados:

  * 🟢 En rango
  * 🟡 Desviación moderada
  * 🔴 Desviación alta
  * ⚪ Sin base
* El cambio entre activas y archivadas funcionó correctamente.
* La tabla siguió funcionando.
* El Gantt siguió funcionando.
* Crear, editar, archivar y restaurar siguieron funcionando correctamente.
## Fase 11D — Filtros gerenciales Plan vs Real

Se habilitó en Preview un bloque de filtros gerenciales para analizar la planificación operativa y la ejecución real.

Filtros agregados:

* Semáforo
* Geocerca
* Actividad
* Estado
* Fecha desde
* Fecha hasta

Los filtros afectan:

* KPIs generales
* KPIs Plan vs Real
* Tabla de planificación
* Gantt semanal

Reglas de funcionamiento:

* La carga original desde Supabase se mantiene sin cambios.
* Se crea una lista derivada `tareasFiltradas`.
* Los KPIs se calculan sobre `tareasFiltradas`.
* La tabla muestra `tareasFiltradas`.
* El Gantt muestra `tareasFiltradas`.
* El botón `Limpiar filtros` restaura la vista completa del modo actual.

Regla de rango de fechas:

* Si existe `fechaDesde`, una planificación se muestra si su fecha fin es mayor o igual a `fechaDesde`.
* Si existe `fechaHasta`, una planificación se muestra si su fecha inicio es menor o igual a `fechaHasta`.
* Esto permite mostrar planificaciones que se cruzan con el rango seleccionado.

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
* La consulta a `v_costos_hybrid_preview` sigue siendo solo lectura.
* Producción no fue tocada.

Validación Preview:

* Se filtró por semáforo rojo.
* Se filtró por geocerca.
* Se filtró por actividad.
* Se filtró por estado.
* Se filtró por fecha desde y fecha hasta.
* Los KPIs, la tabla y el Gantt cambiaron correctamente con los filtros.
* El botón `Limpiar filtros` restauró la vista completa.
* Crear, editar, archivar y restaurar siguieron funcionando correctamente.
## Fase 11E — Exportar CSV de vista filtrada

Se habilitó en Preview la exportación CSV de la vista filtrada del módulo de planificación.

Objetivo:

* Permitir que el usuario filtre la planificación por criterios gerenciales.
* Exportar exactamente la vista visible en ese momento.
* Usar el archivo CSV como resumen gerencial para Excel, auditoría o revisión operativa.

Fuente exportada:

* `tareasFiltradas`

Columnas incluidas en el CSV:

* ID
* Geocerca
* Actividad
* Fecha inicio
* Fecha fin
* Horas planificadas
* Costo planificado
* Horas reales
* Costo real
* Diferencia horas
* Diferencia costo
* Semáforo
* Detalle semáforo
* Estado
* Notas
* Modo
* Fecha exportación

Reglas de funcionamiento:

* El botón `Exportar CSV` se agregó junto a `Limpiar filtros`.
* El botón exporta la vista filtrada actual.
* Si no hay filas filtradas, el botón queda deshabilitado.
* El CSV se genera en el navegador.
* El CSV incluye BOM UTF-8 para mejorar compatibilidad con Excel.
* No se realiza una nueva consulta a Supabase al exportar.
* No se modifica la base de datos.

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
* La consulta a `v_costos_hybrid_preview` sigue siendo solo lectura.
* Producción no fue tocada.

Validación Preview:

* Se aplicó un filtro por semáforo rojo.
* Se exportó CSV correctamente.
* El CSV abrió en Excel.
* El CSV exportó solo la vista filtrada.
* Se limpiaron filtros.
* Se exportó nuevamente la vista completa actual.
* Crear, editar, archivar y restaurar siguieron funcionando correctamente.
## Fase 11F — Resumen ejecutivo visual por semáforo

Se habilitó en Preview un resumen ejecutivo visual para analizar rápidamente la distribución de planificaciones según su semáforo Plan vs Real.

Objetivo:

* Mostrar una lectura gerencial inmediata del estado operativo.
* Identificar cuántas planificaciones están en rango.
* Identificar cuántas tienen desviación moderada.
* Identificar cuántas tienen desviación alta.
* Identificar cuántas no tienen base suficiente para cálculo.

Tarjetas agregadas:

* En rango
* Desviación moderada
* Desviación alta
* Sin base

Fuente de cálculo:

* `tareasFiltradas`

Reglas de funcionamiento:

* El resumen se calcula sobre la vista filtrada actual.
* Respeta filtros por semáforo, geocerca, actividad, estado y rango de fechas.
* Respeta el modo actual: activas o archivadas.
* Al limpiar filtros, el resumen vuelve a calcularse sobre toda la vista actual.
* No realiza nuevas consultas a Supabase.
* No modifica la base de datos.

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
* La consulta a `v_costos_hybrid_preview` sigue siendo solo lectura.
* Producción no fue tocada.

Validación Preview:

* El bloque `Resumen ejecutivo por semáforo` apareció correctamente.
* Las tarjetas `En rango`, `Desviación moderada`, `Desviación alta` y `Sin base` se mostraron correctamente.
* Las tarjetas cambiaron al aplicar filtros.
* El botón `Limpiar filtros` restauró el resumen completo.
* La exportación CSV siguió funcionando.
* Crear, editar, archivar y restaurar siguieron funcionando correctamente.
* Los acentos se visualizaron correctamente en el navegador.
## Fase 11G — Totales en tabla de planificación

Se agregó en Preview una fila de totales al final de la tabla de planificación.

Objetivo:

* Mostrar el total de la vista actual directamente dentro de la tabla.
* Facilitar revisión gerencial sin depender solo de los KPIs superiores.
* Mantener consistencia entre filtros, tabla, KPIs, Gantt y exportación.

Totales agregados:

* Horas planificadas
* Costo planificado
* Horas reales
* Costo real
* Diferencia de horas
* Diferencia de costo

Fuente de cálculo:

* `tareasFiltradas`

Reglas de funcionamiento:

* Los totales se calculan sobre la vista filtrada actual.
* Respetan filtros por semáforo, geocerca, actividad, estado y rango de fechas.
* Respetan el modo actual: activas o archivadas.
* Al limpiar filtros, los totales vuelven a calcularse sobre toda la vista actual.
* Si no hay filas visibles, no se muestra la fila de totales.
* No realiza nuevas consultas a Supabase.
* No modifica la base de datos.

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
* La consulta a `v_costos_hybrid_preview` sigue siendo solo lectura.
* Producción no fue tocada.

Validación Preview:

* La tabla mostró la fila `Total vista actual`.
* Los totales de horas y costos se visualizaron correctamente.
* Los totales cambiaron al aplicar filtros.
* Los totales volvieron al valor completo al limpiar filtros.
* El cambio entre activas y archivadas funcionó correctamente.
* Crear, editar, archivar, restaurar y exportar CSV siguieron funcionando correctamente.
## Fase 12A — Pulido comercial visual/textos

Se aplicó en Preview un pulido comercial del módulo de planificación operativa.

Objetivo:

* Mejorar la presentación del módulo para demostraciones comerciales.
* Comunicar mejor el valor gerencial del módulo.
* Mostrar el módulo como una herramienta de control operativo, no solo como una tabla de planificación.

Cambios visuales y de texto:

* Se mejoró el encabezado principal.
* Se agregó el concepto `Control gerencial operativo`.
* Se agregaron badges comerciales:

  * Preview seguro
  * Plan vs Real
  * CSV ejecutivo
* Se mejoró el texto descriptivo del módulo.
* Se ajustaron textos de filtros para explicar que afectan KPIs, tabla, Gantt y exportación.
* El botón de exportación pasó a mostrarse como `Exportar CSV ejecutivo`.
* Los KPIs generales recibieron etiquetas más orientadas a cliente:

  * Planificaciones visibles
  * Cerradas
  * En ejecución
  * Avance operativo
* La tabla mantiene el indicador `Datos reales Preview`.
* La fila de totales se presenta como `Total vista filtrada`.
* La vista temporal se presenta como `Gantt operativo semanal`.

Reglas de funcionamiento:

* No se modificó la lógica de carga de datos.
* No se modificó la lógica de creación.
* No se modificó la lógica de edición.
* No se modificó la lógica de archivado.
* No se modificó la lógica de restauración.
* No se modificó la exportación CSV.
* No se modificaron los filtros.
* No se modificó el cálculo de KPIs.
* No se modificó el cálculo del semáforo.
* No se modificó el Gantt.

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
* La consulta a `v_costos_hybrid_preview` sigue siendo solo lectura.
* Producción no fue tocada.

Validación Preview:

* El encabezado comercial se visualizó correctamente.
* Los badges `Preview seguro`, `Plan vs Real` y `CSV ejecutivo` se visualizaron correctamente.
* El botón `Exportar CSV ejecutivo` funcionó correctamente.
* La tabla mostró `Datos reales Preview` y `Total vista filtrada`.
* El Gantt se visualizó como `Gantt operativo semanal`.
* Filtros, KPIs, resumen semáforo y CSV siguieron funcionando.
* Crear, editar, archivar y restaurar siguieron funcionando correctamente.
* Los acentos se visualizaron correctamente en el navegador.
