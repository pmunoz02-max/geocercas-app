# Extracción del helper de elegibilidad de asignaciones

Fecha: 2026-09-08  
Branch: preview  
Archivo principal: api/send-position.js

## Objetivo

Se movió la lógica de evaluación de asignación activa a un helper compartido del backend para evitar duplicación sin cambiar comportamiento ni consultas.

## Helper extraído

Se creó el módulo:

- `server/api-lib/assignment-eligibility.js`

El contenido exporta:

- `normalizeAssignmentStatus(value)`
- `isActiveAssignment(row, now = new Date())`

## Reglas preservadas

El comportamiento no cambia:

- rechaza filas con `is_deleted === true`
- si `status` o `estado` es truthy, `status` prevalece sobre `estado` para la validación
- un estado vacío se considera permitido y no invalida la fila
- solo acepta estados activos compatibles: `active`, `activa`, `activo`, `enabled`, `vigente`
- `start_time` / `end_time` invalidos se ignoran, sin rechazar la fila
- los límites de timestamps son inclusivos: `start_time` == ahora es válido y `end_time` == ahora es válido
- las fechas se validan por día UTC: `start_date` y `end_date` comparan solo el `YYYY-MM-DD` del valor con el día UTC actual

## Integración

El endpoint `api/send-position.js` importa `isActiveAssignment` desde:

- `../server/api-lib/assignment-eligibility.js`

La lógica local extraída fue eliminada del archivo de endpoint para mantener la misma semántica sin alterar consultas ni tracking.

## Archivos no modificados funcionalmente

No se cambió:

- ninguna consulta SQL o fetch
- ninguna lógica de tracking ni sync
- ninguna mutación del flujo de posiciones
- la firma pública del helper, salvo la extracción a un módulo compartido
