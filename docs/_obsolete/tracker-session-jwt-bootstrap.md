# Tracker Session JWT Bootstrap

Fecha: 2026-04-08  
Branch: preview

## Cambio realizado

Se actualizó `supabase/functions/accept-tracker-invite/index.ts` para emitir una sesión JWT custom para tracker invite bootstrap.

## Motivo

El flujo de invitación opaca ya resolvía correctamente:

- invite token hash
- validación del invite
- resolución de `tracker_user_id`

El bloqueo restante era la creación de una sesión frontend usable para tracking autónomo sin depender de query params ni refresh flow estándar.

## Decisión de arquitectura

Se reemplazó el enfoque previo de JWT por uno compatible con `jose` (`SignJWT`) firmado con `JWT_SECRET` definido en Supabase secrets.

## Claims emitidos

```json
{
  "sub": "tracker_user_id",
  "email": "invite_email",
  "role": "authenticated",
  "aud": "authenticated",
  "org_id": "organization_id"
}