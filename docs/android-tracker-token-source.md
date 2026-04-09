# Android tracker token source

Fecha: 2026-04-08
Branch: preview

## Problema detectado

El servicio nativo Android podía seguir reutilizando un token viejo del owner aunque el tracker bootstrap ya hubiera entregado un nuevo token custom del tracker invitado.

Esto provocaba:
- posiciones atribuidas al owner
- dashboard del tracker invitado mostrando "Sin conexión"
- errores por token expirado del owner

## Regla de arquitectura

Para tracking nativo Android, la única fuente válida de token es:

1. runtimeAccessToken
2. tracker_prefs.access_token

## Regla operativa

No usar fallback a:
- auth_token
- tracker_token
- tokens legacy del owner

## Bootstrap

Cuando llega un nuevo access_token del tracker:
- sobrescribir runtimeAccessToken
- sobrescribir tracker_prefs.access_token
- borrar tokens legacy
- usar solo el nuevo token en Authorization Bearer