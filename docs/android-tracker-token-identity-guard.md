# Android tracker token identity guard

Fecha: 2026-04-08
Branch: preview

## Problema detectado

El servicio nativo podía seguir reutilizando un token viejo del owner aunque el tracker esperado fuera otro.

## Regla de seguridad

Antes de cada envío nativo, el JWT debe cumplir:

- `sub == tracker_user_id` esperado
- `exp` vigente

## Si falla

- limpiar token
- limpiar tracker_user_id persistido asociado si corresponde
- no enviar posiciones
- registrar log de mismatch o expiración

## Objetivo

Impedir que un tracker invitado publique posiciones con identidad de otro usuario.