# Personal ↔ Auth User Sync (Tracker Identity)

## Problema
Algunas filas en `public.personal` no tenían `user_id`, lo que impedía:

- asignaciones de tracker
- envío de posiciones
- consistencia entre frontend y backend

## Regla universal

- `owner_id` = usuario que creó el registro
- `user_id` = usuario que opera como tracker

Nunca deben confundirse.

## Solución implementada

En `api/accept-tracker-invite.js`:

Al aceptar una invitación:

1. Se resuelve `trackerUserId` desde auth
2. Se busca en `personal` dentro de la misma `org_id` usando:
   - `email_norm`
   - `identity_key`
3. Si hay match:
   - se sincroniza `personal.user_id = trackerUserId`

## Propiedades

- No rompe si no encuentra match
- No usa `owner_id`
- Es idempotente
- Solo afecta la misma organización

## Impacto

- Las asignaciones ahora funcionan solo con trackers reales
- Se elimina el estado inconsistente "persona sin user_id"
- Se alinea con `tracker_positions.user_id`

## Futuro

- filtrar en frontend solo personas con `user_id`
- alertar visualmente cuando no estén vinculadas