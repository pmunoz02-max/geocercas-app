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