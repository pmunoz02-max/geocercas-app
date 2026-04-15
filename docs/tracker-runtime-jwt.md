# Tracker runtime JWT

## Cambio
Se actualizó `api/accept-tracker-invite.js` para que `tracker_runtime_token` deje de ser un token aleatorio hex y pase a ser un JWT firmado.

## Motivo
Android valida el token runtime como JWT y necesita leer:
- `sub`
- `exp`

Con el token aleatorio anterior, el servicio nativo rechazaba la sesión y no enviaba posiciones automáticamente.

## Nuevo formato del token
El JWT incluye:
- `sub`: `tracker_user_id`
- `org_id`: organización del tracker
- `invite_id`: id de la invitación
- `type`: `tracker_runtime`

## Impacto esperado
- `ForegroundLocationService` debe aceptar la sesión runtime
- el tracker debe enviar posiciones sin tocar "Refrescar estado"
- `tracker_latest` debe actualizarse
- el dashboard debe reflejar nuevas posiciones

## Configuración requerida
Environment variable en Vercel Preview:
- `TRACKER_RUNTIME_JWT_SECRET`

## Archivos afectados
- `api/accept-tracker-invite.js`