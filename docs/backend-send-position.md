# Backend GPS: `api/send-position.js` (Preview)

**Actualizado:** 2026-10-23  
**Entorno:** exclusivamente `preview` / Supabase Preview. **No documenta un despliegue en Producción.**  
**Estado al cierre de esta revisión:** migración SQL aplicada y verificada en Supabase Preview; implementación v21 y pruebas locales preparadas; **commit, push y validación de Vercel pendientes**.

> Este documento sustituye la descripción operativa histórica del endpoint `send_position` por el contrato vigente de `api/send-position.js`. La descripción anterior se conserva al final como antecedente. Para la telemetría opcional, consultar [2026-10-09-send-position-telemetry-preview.md](2026-10-09-send-position-telemetry-preview.md).

## 1. Endpoint y autenticación

- Ruta de recepción Android: `POST /api/send-position` (función Vercel `api/send-position.js`).
- Autenticación: `Authorization: Bearer <tracker_access_token>`, **token runtime del tracker**; no se acepta el JWT de sesión web como sustituto.
- El servidor calcula el hash SHA-256 del token y obtiene la sesión activa desde `tracker_runtime_sessions`; comprueba vigencia, revocación y membresía activa con rol `tracker` en la organización de la sesión.
- La identidad autorizada se toma **exclusivamente** de `session.org_id` y `session.tracker_user_id`, nunca de valores arbitrarios del cliente. Si el cuerpo trae `org_id` o `user_id` distintos, devuelve HTTP `409` (`session_identity_mismatch`).
- Ausencia de bearer o sesión inválida: HTTP `401`. Método distinto de POST: HTTP `405`.
- Las consultas y escrituras de la función usan credenciales del servidor (`service_role`); por ello las comprobaciones de identidad no pueden delegarse únicamente a RLS.

## 2. Validación de posición y regla de geocercas

- Acepta `lat`/`lng` (o `latitude`/`longitude`) y los campos opcionales `accuracy`, `speed` y `heading`.
- `speed` debe ser número finito ≥ 0, o estar ausente/ser `null`; `heading` debe ser número finito dentro de `[0, 360)`, o estar ausente/ser `null`. Valores inválidos devuelven HTTP `400`.
- Antes de insertar una **posición nueva**, consulta las asignaciones activas del tracker y las geocercas activas asociadas; admite las geometrías circular y GeoJSON contempladas en la implementación.
- Si la posición no supera la regla de geocercas, responde HTTP `200` con `{ "ok": true, "stored": false, "reason": "..." }` y **no la inserta**. `ok: true` en este caso significa que el servidor procesó la solicitud, **no** que guardó el punto.
- **v21:** después de autenticar y validar los campos, un reintento con `client_position_id` que ya exista para la misma organización y tracker se reconoce **antes** de volver a evaluar la geocerca. Esto permite confirmar una inserción anterior aunque la asignación haya cambiado desde el primer envío.

## 3. Persistencia actual

- Tabla de destino: `public.tracker_positions` (no `positions`).
- La función inserta `org_id`, `user_id`, latitud, longitud, precisión, velocidad, rumbo, `recorded_at`, `source` y `created_at`. Si se suministra un `client_position_id` válido, también se inserta ese UUID.
- La inserción se considera confirmada cuando PostgREST responde correctamente y devuelve el identificador de fila `id`.
- **Este endpoint no actualiza `tracker_latest`.** El comportamiento histórico de actualización de esa tabla no aplica al endpoint Vercel actual.

## 4. Idempotencia GPS v21

**Objetivo:** cada muestra GPS debe tener un identificador estable generado por el cliente y conservado sin cambios al reenviarla tras pérdida de red o de confirmación HTTP. El backend no genera un identificador nuevo para un reintento.

### Base de datos (Supabase Preview)

La migración aditiva ejecutada el 2026-10-23 añadió:

```sql
-- SQL de referencia: YA EJECUTADO en Supabase Preview; no volver a aplicarlo por esta documentación.
ALTER TABLE public.tracker_positions
  ADD COLUMN IF NOT EXISTS client_position_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS tracker_positions_identity_client_position_uidx
  ON public.tracker_positions (org_id, user_id, client_position_id)
  WHERE client_position_id IS NOT NULL;
```

- La columna es opcional (`UUID NULL`), lo que conserva compatibilidad con Android v20 y los registros antiguos.
- El índice único **parcial** evita duplicados de un mismo `(org_id, user_id, client_position_id)`, incluso con solicitudes concurrentes. No sustituye la clave primaria de `id` ni los índices de consulta existentes.
- No se modificaron las políticas RLS ni las concesiones de permisos existentes. RLS estaba habilitado (`relrowsecurity=true`, `relforcerowsecurity=false`).
- Verificación posterior: `column_ok=true`, `unique_index_ok=true`, **16.728 posiciones históricas**, **0** con `client_position_id` en el momento de la comprobación.
- No suponer que `ON CONFLICT`/upsert estándar de PostgREST reconoce automáticamente este índice parcial: la implementación usa `INSERT` normal y maneja explícitamente el conflicto.

### Comportamiento del backend v21 preparado localmente

1. Valida que `client_position_id`, cuando está presente, sea una cadena UUID admitida; si no, devuelve HTTP `400` (`invalid_client_position_id`).
2. Tras autenticar la identidad, consulta `tracker_positions` con filtros por `org_id`, `user_id` y `client_position_id`. Si encuentra una fila previa, confirma el reintento sin insertar de nuevo.
3. Si la fila no existe, aplica la regla de geocercas e intenta la inserción normal con el mismo identificador del cliente.
4. Si dos peticiones compiten y PostgreSQL devuelve `409` con código `23505`, busca la fila **dentro de la misma identidad**. Solo si la encuentra reconoce el reintento; de lo contrario devuelve error y **no simula un éxito**.
5. Para un cliente sin `client_position_id`, mantiene el comportamiento y la respuesta previa; estos envíos antiguos **no tienen garantía de idempotencia**.

### Contrato de respuesta del código preparado

| Situación | HTTP | Respuesta relevante |
| --- | --- | --- |
| Inserción confirmada con ID v21 | `200` | `{ "ok": true, "stored": true, "duplicate": false }` |
| Reenvío confirmado con ID v21 | `200` | `{ "ok": true, "stored": true, "duplicate": true }` |
| Inserción confirmada sin ID (v20) | `200` | `{ "ok": true }` |
| Fuera de una geocerca asignada activa | `200` | `{ "ok": true, "stored": false, "reason": "..." }` |
| Identificador v21 inválido | `400` | `{ "ok": false, "error": "invalid_client_position_id" }` |
| Conflicto no verificable / fallo de inserción | `500` | `{ "ok": false, "error": "tracker_position_insert_failed" }` |

**Precaución del cliente Android:** el v20 actual considera exitoso cualquier HTTP 2xx. Una versión Android posterior debe inspeccionar `stored` si necesita distinguir almacenamiento real frente a exclusión por política de geocercas. No cambiar retroactivamente el significado de la regla existente sin una decisión explícita.

## 5. Pruebas y estado de despliegue

Validaciones locales realizadas en la rama `preview`:

- `npx vitest run src/test/send-position-telemetry.test.js`: **37/37** pruebas aprobadas: 30 originales y 7 nuevas sobre idempotencia, conflictos e identificadores inválidos.
- `npx vitest run`: **277/277** pruebas aprobadas en **31** archivos.
- `npm run build`: compilación satisfactoria (**14,00 s**).
- La prueba que simula `23505` sin fila coincidente emite un error esperado en consola; no es una falla del conjunto de pruebas.

**Pendiente a la fecha de este documento:** commit selectivo en `preview`, push a `origin/preview`, verificar el despliegue en Vercel Preview y realizar una prueba controlada de persistencia/reintento contra Supabase Preview. Las pruebas actuales utilizan mocks y **no constituyen por sí solas una prueba de integración real**. Ningún paso autoriza promoción o push a Producción.

## 6. Android, cola offline y protección de datos

- El esquema de backend es compatible con Android Preview v20, pero **v20 no envía todavía el nuevo UUID estable por posición**.
- La integración Android Preview v21 con SQLite y la migración segura de la cola local son trabajos **pendientes y separados**; no se declara que estén implementados.
- Existe un respaldo privado verificado de **500 posiciones pendientes** de Android Preview. No borrar ni sustituir la cola antigua, reinstalar la app, rotar identidades o eliminar registros por cambio de token antes de verificar una migración recuperable y sin pérdida de datos.
- Deben mantenerse aisladas las identidades de organización/tracker y la cola offline. Una renovación de token no debe interpretarse automáticamente como cambio de identidad de los puntos almacenados.
- Documentar y probar el camino completo de reintento y confirmación antes de liberar v21.

## 7. Antecedente histórico: flujo `send_position` anterior

Las siguientes afirmaciones pertenecen a una implementación **anterior** y **no describen el endpoint Vercel actual**:

- Se describía una inserción en `positions`, con control de límites de envío y respuestas como `tracker_limit_reached` o `enforcement_check_failed`.
- Después de insertar se intentaba actualizar `tracker_latest` y se comunicaba `tracker_latest_updated` o `tracker_latest_reason`.
- La respuesta exitosa se documentaba como `{ ok: true, build_tag, tracker_latest_updated, tracker_latest_reason }`.

Estas características se conservan únicamente como contexto histórico; no deben usarse para interpretar ni cambiar el contrato actual de `/api/send-position`.
