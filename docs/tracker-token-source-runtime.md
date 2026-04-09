# Tracker token source runtime

Fecha: 2026-04-08  
Branch: preview

## Problema detectado

Aunque `send_position` ya prioriza correctamente `jwt.sub` cuando recibe un Bearer válido, el runtime del tracker podía enviar un token viejo o expirado perteneciente al owner de la organización.

Esto provocaba:

- actividad atribuida al owner
- dashboard del tracker invitado mostrando "Sin conexión"
- errores de autenticación por token expirado

## Regla de arquitectura

Para tracking runtime activo, la única credencial válida para `send_position` es:

- `tracker_access_token`

## Regla operativa

No usar fallback a sesión web del owner para llamadas de tracking.

## Bootstrap

Cuando `accept-tracker-invite` devuelve una nueva sesión custom:

- sobrescribir `tracker_access_token`
- limpiar tokens legacy del runtime
- continuar tracking con el nuevo token

## Objetivo

Mantener alineados:

- tracker invitado
- token runtime
- persistencia en positions / tracker_latest
- estado online del dashboard