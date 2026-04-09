# Android running service token refresh

Fecha: 2026-04-08
Branch: preview

## Problema detectado

El bootstrap web del tracker guardaba el nuevo access_token, pero el ForegroundLocationService ya en ejecución no recibía un nuevo intent con ese token.

Esto provocaba:
- continuidad del token viejo del owner en el servicio nativo
- envío de posiciones con identidad equivocada
- errores por token expirado
- dashboard marcando conectado al owner y desconectado al tracker invitado

## Regla de arquitectura

Cuando el bootstrap obtiene un nuevo tracker access_token, debe empujarlo explícitamente al servicio nativo en ejecución.

## Regla operativa

Web bootstrap
→ guardar token
→ enviar token al bridge Android
→ reenviar token al ForegroundLocationService con extra `access_token`
→ `onStartCommand` debe procesarlo siempre

## Resultado esperado

El servicio vivo actualiza su token sin requerir reinicio manual ni fallback a tokens legacy.