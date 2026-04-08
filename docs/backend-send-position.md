# Flujo backend: send_position

Este documento describe el flujo técnico del endpoint send_position en el backend.

## 1. Autenticación
- El endpoint recibe un JWT de usuario (header `authorization` o `x-user-jwt`).
- Se valida el token y se obtiene el usuario vía Supabase Auth.
- Si el token es inválido, ausente o expirado, responde 401.

## 2. Validación de límites y permisos
- Se ejecuta el RPC `rpc_tracker_can_send` para el usuario y organización.
- Si el RPC responde error o `false`, responde 403 (tracker_limit_reached) o 500 (enforcement_check_failed).

## 3. Inserción de posición
- Si el RPC es exitoso, se intenta insertar la posición en la tabla `positions`.
- Si ocurre un error en el insert, responde 500 y loguea el error.
- Si el insert es exitoso, continúa el flujo.

## 4. Actualización de estado operativo
- Tras insertar en `positions`, se actualiza (o intenta actualizar) la fila correspondiente en `tracker_latest` para reflejar el estado más reciente del tracker.
- Si la actualización falla, el endpoint responde 200 pero incluye el motivo en `tracker_latest_reason`.

## 5. Respuesta
- Si todo es exitoso, responde `{ ok: true, build_tag, tracker_latest_updated, tracker_latest_reason }`.
- Todos los errores relevantes se loguean en consola para trazabilidad.

---

Este flujo aplica tanto para modo proxy (firmado con HMAC) como para modo web/app (JWT de usuario).
