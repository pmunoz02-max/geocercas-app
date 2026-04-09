# Tracker Custom JWT Runtime

Fecha: 2026-04-08  
Branch: preview

## Objetivo

Desacoplar el tracking runtime de la sesión clásica de Supabase Auth.

## Decisión

El flujo de tracker invite bootstrap usa un JWT custom emitido por `accept-tracker-invite`.

Ese token:

- se recibe en frontend como `session.access_token`
- se persiste en runtime como `tracker_access_token`
- se usa explícitamente para llamadas de tracking como `send_position`
- no depende de `refresh_token`
- no depende de `supabase.auth.setSession()`

## Motivo

`setSession()` no es una base confiable para este flujo porque espera semántica de refresh session estándar.

El tracker necesita una credencial estable para operar de forma autónoma después del bootstrap.

## Runtime resultante

Invite opaco  
→ `accept-tracker-invite`  
→ JWT custom tracker  
→ persistencia frontend  
→ `trackerSessionReady = true`  
→ `trackerApi` usa `tracker_access_token` en Bearer  
→ `send_position` funciona sin sesión Supabase clásica

## Regla

Para tracking runtime, la fuente principal de autenticación es `tracker_access_token`.

La sesión clásica de Supabase queda como fallback o para otros flujos, no como dependencia obligatoria del tracker bootstrap.