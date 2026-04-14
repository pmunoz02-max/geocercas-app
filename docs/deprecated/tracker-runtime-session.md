# Tracker Runtime Session (Preview)


## Objetivo
Asegurar que el tracking use identidad de tracker (no owner) mediante un token opaco de runtime.


## Flujo

1. Tracker acepta invitación
2. Edge Function `accept-tracker-invite`:
   - Resuelve `tracker_user_id`
   - Genera un token opaco de runtime (no JWT)
   - Guarda solo el hash del token (`access_token_hash`) en `tracker_runtime_sessions`
   - Devuelve el token plano al cliente una sola vez
3. El cliente usa ese token para enviar posiciones
4. El backend valida el hash del token recibido contra la base de datos

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
- ✅ Solo usar token opaco de runtime
- ✅ La base de datos almacena únicamente el hash del token (`access_token_hash`)
- ✅ El cliente recibe el token plano una sola vez
- ✅ El backend valida el hash del token recibido

## Problema resuelto

Antes:
- No se insertaba runtime session
- `invalid_token`


Ahora:
- Se requiere `token_version`
- Se valida existencia de sesión antes de responder OK
- El backend nunca almacena el token plano, solo el hash