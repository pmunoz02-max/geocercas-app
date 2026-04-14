# Tracker Runtime User ID Fix

## Problema

El endpoint `api/accept-tracker-invite.js` estaba resolviendo el tracker con:

- `personal.id`

en lugar de:

- `personal.user_id`

## Impacto

Esto provocaba:

- asociación incorrecta del `tracker_user_id`
- tracker activo incorrecto en dashboard
- desalineación entre invite, runtime token y tracker health
- posibles errores `invalid_token` en Android tracking

## Solución aplicada

Se actualizó la resolución del tracker para usar:

- `personal.user_id`

y se agregó validación explícita cuando `personal.user_id` falta.

## Efecto esperado

- el tracker invitado correcto queda asociado al runtime
- `tracker_health` se registra para el usuario correcto
- el dashboard muestra el tracker correcto en lugar del owner
- se reduce la desalineación entre JWT y `tracker_user_id`

## Nota operativa

Después de este fix se recomienda:

- generar un invite nuevo
- no reutilizar invites previos
- volver a probar el flujo completo desde Android