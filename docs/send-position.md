# Send Position Flow

## Autenticación

El endpoint soporta dos modos:

1. Web Auth (JWT)
   - Authorization: Bearer <access_token>
   - user_id se obtiene desde auth.getUser()

2. Proxy HMAC
   - Firma HMAC válida
   - user_id viene en el body

## Inserción

Se inserta en tabla `positions`:

- user_id
- org_id
- lat
- lng
- metadata adicional

## Logs

Se agregan logs para debugging:

- [send_position] resolved_auth
- [send_position] positions_insert_ok
- [send_position] positions_insert_failed

## Reglas

Debe cumplirse:

user_id == auth.users.id == personal.user_id

## Objetivo

Asegurar trazabilidad completa del pipeline de tracking
# send_position – v20 user_id uuid

## Cambio
Se actualiza `send_position` para asegurar que `positions.user_id` se inserte como `uuid` real y no como `text`.

## Motivo
El endpoint devolvía error 500:
`column "user_id" is of type uuid but expression is of type text`

## Impacto
- Corrige inserción en `positions`
- Desbloquea tracking Android hacia backend
- Mantiene integridad de tipos en base de datos

## Build tag
`send_position-v20_user_id_uuid_preview_20260407`

## Entorno
Solo branch `preview`.