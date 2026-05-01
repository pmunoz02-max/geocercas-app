> ⚠️ SUPERSEDED / HISTÓRICO
>
> Este documento queda como referencia histórica.  
> La fuente viva actual del flujo invite/tracker es:
>
> docs/skills/invite-tracker.md
>
> Regla vigente: signaciones = fuente operativa/UI, 	racker_assignments = espejo runtime Android, 	racker_positions = fuente canónica de posiciones dashboard.

---
# Tracker Runtime User ID Fix

## Problema

El endpoint `api/accept-tracker-invite.js` estaba resolviendo el tracker con:

- `personal.id`

en lugar de:

- `personal.user_id`

## Impacto

Esto provocaba:

- asociaciÃ³n incorrecta del `tracker_user_id`
- tracker activo incorrecto en dashboard
- desalineaciÃ³n entre invite, runtime token y tracker health
- posibles errores `invalid_token` en Android tracking

## SoluciÃ³n aplicada

Se actualizÃ³ la resoluciÃ³n del tracker para usar:

- `personal.user_id`

y se agregÃ³ validaciÃ³n explÃ­cita cuando `personal.user_id` falta.

## Efecto esperado

- el tracker invitado correcto queda asociado al runtime
- `tracker_health` se registra para el usuario correcto
- el dashboard muestra el tracker correcto en lugar del owner
- se reduce la desalineaciÃ³n entre JWT y `tracker_user_id`

## Nota operativa

DespuÃ©s de este fix se recomienda:

- generar un invite nuevo
- no reutilizar invites previos
- volver a probar el flujo completo desde Android
