
# Flujo backend: send_position

Este documento describe el flujo técnico del endpoint `send_position` en el backend, usando exclusivamente el token de acceso runtime del tracker (`tracker_access_token`). No se utiliza JWT de usuario ni autenticación web.


## 1. Autenticación
- El endpoint recibe el token runtime del tracker en el header `Authorization: Bearer <tracker_access_token>`.
- Se valida el hash del token contra la tabla `tracker_runtime_sessions` (debe estar activo y no expirado).
- Si el token es inválido, ausente o expirado, responde 401.


## 2. Validación de límites y permisos
- Se valida que el tracker tenga una asignación activa y que no haya superado los límites de envío configurados para la organización.
- Si el tracker no tiene asignación activa o supera los límites, responde 403 (tracker_limit_reached) o 500 (enforcement_check_failed).


## 3. Inserción de posición
- Si la validación es exitosa, se intenta insertar la posición en la tabla `positions`.
- Si ocurre un error en el insert, responde 500 y loguea el error.
- Si el insert es exitoso, continúa el flujo.


## 4. Actualización de estado operativo
- Tras insertar en `positions`, se actualiza (o intenta actualizar) la fila correspondiente en `tracker_latest` para reflejar el estado más reciente del tracker.
- Si la actualización falla, el endpoint responde 200 pero incluye el motivo en `tracker_latest_reason`.


## 5. Respuesta
- Si todo es exitoso, responde `{ ok: true, build_tag, tracker_latest_updated, tracker_latest_reason }`.
- Todos los errores relevantes se loguean en consola para trazabilidad.


---

**Nota:** El endpoint `send_position` solo acepta autenticación mediante el token runtime del tracker. No se permite autenticación con JWT de usuario ni sesión web.
