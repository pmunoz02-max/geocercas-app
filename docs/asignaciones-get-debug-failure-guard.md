# Guard de error en GET de asignaciones

Fecha: 2026-09-08  
Branch: preview  
Archivo principal: api/asignaciones.js

## Problema

El endpoint GET de `api/asignaciones.js` recupera datos de varias tablas para construir el payload de la organización solicitada (`personal`, `geofences`, `activities` y `asignaciones`).

Aunque cada consulta se captura de forma aislada en `debug.queries`, el endpoint podía responder `200 OK` incluso cuando alguna de esas consultas devolvía un error interno. Eso exponía una respuesta exitosa en una operación que en realidad estaba parcialmente fallida.

## Cambio

Se añadió una comprobación final antes de responder éxito:

- Si `debug.queries` contiene cualquier entrada con `error` definido, el endpoint responde con HTTP `500`.
- La respuesta es genérica: `{ ok: false, error: "internal_server_error" }`.
- No se exponen detalles internos de Supabase ni mensajes de base de datos al cliente.

## Regla permanente

Para este GET, el comportamiento correcto es:

- mantener intactas las consultas existentes,
- conservar la autorización vigente y la estructura de respuesta exitosa,
- y devolver `500` con `ok: false` cuando alguna consulta interna falló.

## Archivos no modificados

No se tocaron:

- frontend,
- SQL,
- otros métodos HTTP del endpoint,
- ni la respuesta exitosa normal del GET.
