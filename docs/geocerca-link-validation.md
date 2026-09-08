# Validación de vínculo geofence-geocerca en asignaciones

Fecha: 2026-09-08  
Branch: preview

## Esquema real revisado

La evidencia revisada confirma lo siguiente:

- `public.asignaciones.geocerca_id` admite `NULL` en el esquema actual; es un enlace opcional y no está forzado a `NOT NULL` en la definición del modelo de asignación.
- `public.tracker_assignments.geofence_id` es obligatorio. La tabla usa `geofence_id` como clave de sincronización y la migración/backup de esquema muestran `geofence_id` como campo requerido en la tabla de asignaciones del tracker.
- `public.geofences.source_geocerca_id` admite `NULL` y no tiene restricción `FOREIGN KEY` declarada; la columna es un enlace opcional a la geocerca origen, con índice único solo cuando el valor no es nulo (`WHERE source_geocerca_id IS NOT NULL`).
- Existen triggers de sincronización desde `public.geocercas` hacia `public.geofences` (por ejemplo, el trigger `geocercas_ensure_geofence_mirror` / `trg_geocercas_ensure_geofence`) que mantienen el espejo de geofences y usan `source_geocerca_id` para relacionarlos.
- La validación relevante para la API no se basa en nombres sino en `id` + `org_id` y en la relación exacta entre `geofence_id` y la geocerca enlazada.

## Cambio aplicado

Se reemplazó la resolución por nombre con una validación exacta basada en IDs y org_id:

- si llega `geofence_id`, se valida que exista en `public.geofences` con ese `id` y el mismo `org_id`
- si `geofences.source_geocerca_id` es `NULL`, se permite `geocerca_id: null` sin forzar enlace
- si `source_geocerca_id` existe, se valida que la geocerca apuntada exista en `public.geocercas` con ese `id` y el mismo `org_id`
- si el cliente envía ambos IDs, se compara la coherencia y se rechaza si no coinciden
- si el cliente solo envía `geocerca_id`, se valida contra la misma org y se acepta si existe
- se elimina la búsqueda por nombre de geocerca para evitar coincidencias accidentales entre entidades del mismo org
- en `PATCH`, los campos omitidos se distinguen de los `null` explícitos con `Object.hasOwn()`, para no reutilizar un valor legado que ya no corresponde al nuevo vínculo
- si cambia `geofence_id`, la validación se deriva desde la nueva geofence sin reutilizar el `geocerca_id` previo
- si no cambia ninguno de los dos campos, se conserva el valor actual sin revalidarlo
- en `POST`, la lógica asigna el `geocerca_id` resuelto sin fallback al valor recibido

## Flujo preservado

- se conserva la ruta de `GET` de `api/asignaciones.js`
- se conserva la sincronización a `tracker_assignments`
- se conserva el flujo en el que la API recibe solo `geocerca_id` y lo valida por `id` + `org_id`

## Error de enlace inválido

Cuando los IDs no están coherentes o no pertenecen a la misma organización, la API responde con:

- `invalid_geofence_geocerca_link`
- `geofence_not_found`
- `geocerca_not_found`

Esto evita saltarse la comprobación por nombre o por entidad incorrecta.

## Pruebas cubiertas

La regresión mockeada incluye cinco escenarios y se ejecuta con este comando desde la raíz del proyecto:

```bash
node --experimental-test-module-mocks --test tests/asignaciones-patch-geofence-link.test.mjs
```

1. `POST` con geofence del mismo org y `source_geocerca_id = null` guarda `geofence_id` y `geocerca_id = null`.
2. `POST` con geofence del mismo org y enlace válido guarda `geofence_id` y el `geocerca_id` enlazado.
3. `POST` con `geocerca_id` incompatible y geofence ajeno rechaza la operación sin insertar asignación ni sincronizar tracker.
4. `POST` con geofence de otra organización rechaza la operación sin insertar asignación ni sincronizar tracker.
5. `PATCH` con cambio de geofence y `geocerca_id` omitido revalida el enlace y persiste ambos IDs nuevos.

## Evidencia de diseño

La regla de negocio revisada es coherente con la estructura real:

- `asignaciones.geocerca_id` puede quedar vacío cuando el geofence no tiene geocerca enlazada
- `tracker_assignments.geofence_id` debe existir siempre porque es la referencia activa del tracker
- `source_geocerca_id` es opcional y simbólico; no es la clave del tracker
- los triggers de `geocercas` hacia `geofences` mantienen el espejo y la relación a partir del origen geocerca
