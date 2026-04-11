# Tracker Runtime Session (Preview)

## Objetivo
Asegurar que el tracking use identidad de tracker (no owner) mediante runtime JWT.

## Flujo

1. Tracker acepta invitación
2. Edge Function `accept-tracker-invite`:
   - resuelve tracker_user_id
   - genera JWT (sub = tracker_user_id)
   - crea registro en `tracker_runtime_sessions`
3. Cliente usa ese token para enviar posiciones

## Tabla: tracker_runtime_sessions

Campos clave:
- org_id
- tracker_user_id
- access_token_hash
- token_version (REQUIRED)
- active
- issued_at
- expires_at

## Regla crítica

- ❌ No usar token de owner
- ❌ No usar sesión Supabase
- ✅ Solo usar runtime JWT
- ✅ Backend define identidad

## Problema resuelto

Antes:
- No se insertaba runtime session
- `invalid_token`

Ahora:
- Se requiere `token_version`
- Se valida existencia de sesión antes de responder OK