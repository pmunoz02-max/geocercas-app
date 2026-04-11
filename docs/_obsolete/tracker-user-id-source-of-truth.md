# Tracker user_id source of truth

Fecha: 2026-04-08  
Branch: preview

## Problema detectado

El tracker runtime con JWT custom enviaba posiciones correctamente, pero `send_position` persistía actividad con un `user_id` distinto al `tracker_user_id` del invite bootstrap.

Esto provocaba:

- `positions` con actividad reciente
- `tracker_latest` con actividad reciente
- dashboard del tracker invitado mostrando "Sin conexión"

## Regla de arquitectura

Cuando `send_position` recibe un Bearer token válido del tracker runtime/custom bootstrap, la fuente de verdad para `user_id` es el claim:

- `sub`

## Prioridad de resolución

1. JWT `sub`
2. fallback legado solo si no existe JWT válido

## Regla de persistencia

El mismo `effective_user_id` debe escribirse de forma consistente en:

- `positions.user_id`
- `tracker_latest.user_id`

## Objetivo

Alinear runtime auth, persistencia y dashboard sobre el mismo `tracker_user_id`.