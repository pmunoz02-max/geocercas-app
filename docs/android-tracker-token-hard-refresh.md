# Android tracker token hard refresh

Fecha: 2026-04-08
Branch: preview

## Problema detectado

El servicio nativo seguía usando un token viejo del owner, incluso después del bootstrap exitoso del tracker invitado.

## Decisión

El reemplazo de token del tracker en Android debe ser explícito y fuerte:

1. limpiar auth state legacy
2. persistir solo el nuevo tracker access token
3. reiniciar ForegroundLocationService con extras:
   - access_token
   - tracker_user_id

## Regla

No confiar en actualización implícita del servicio en ejecución.

## Resultado esperado

El servicio adopta inmediatamente el token del tracker invitado y deja de reutilizar tokens expirados del owner.