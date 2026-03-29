# Invite Tracker Flow

## Regla crítica
El sistema NO permite invitar trackers si no existe un registro previo en `personal`.

## Flujo
1. Resolver `personal_id` (assignment_id o email)
2. Validar que exista en la org
3. Invitar usuario
4. Sincronizar:
   personal.user_id = auth.users.id

## Reglas
personal.user_id == auth.users.id == tracker_positions.user_id

## Errores
- personal_not_found_for_invite (400)
- personal_user_id_conflict (409)
## Update Marzo 2026 – Multi-organización

Se permite invitar usuarios que ya existen en otras organizaciones.

### Regla actualizada

- Si `personal.user_id` ya corresponde al mismo `auth.users.id` del email invitado → PERMITIR
- Solo retornar conflicto (`personal_user_id_conflict`) si:
  - `personal.user_id` pertenece a un usuario distinto al email invitado

### Objetivo

Permitir:
- un mismo usuario en múltiples organizaciones
- roles distintos por organización

Sin romper:
- consistencia de `personal.user_id`
## Update Marzo 2026 – Patch condicional de user_id

Se evita hacer PATCH innecesario sobre `personal.user_id`.

### Nueva lógica

- Si `personal.user_id` es NULL → se asigna `trackerUserId`
- Si `personal.user_id` ya es igual a `trackerUserId` → NO hacer PATCH
- Si `personal.user_id` es distinto → retornar conflicto

### Objetivo

- Evitar errores 500 en invitaciones
- Mantener consistencia sin sobreescrituras
<!-- update: idempotent personal.user_id patch Marzo 2026 -->
## Update Marzo 2026 – Idempotencia del vínculo

Si `personal.user_id` ya es igual al `trackerUserId`, la invitación continúa sin hacer PATCH.
Solo se hace PATCH cuando `personal.user_id` es NULL.
Solo hay conflicto si `personal.user_id` pertenece a otro usuario distinto.
## Update Marzo 2026 – Resolución de personal después de invitar

Después del invite, la relectura de `personal` se hace por `id` del registro.
No se debe filtrar nuevamente por `org_id` en esa lectura final, porque la validación de organización ya ocurrió antes en el flujo.
## Update Marzo 2026 – Resolución por email post-invite

Después de invitar, el registro de personal se resuelve usando email + org_id en lugar de personal_id para evitar inconsistencias en el flujo.
## Update Marzo 2026 – Eliminación de dependencia de personal_id

El flujo de invitación ya no depende de personal_id después del invite.
El registro de personal se resuelve usando email + org_id para garantizar consistencia.
## Update Marzo 2026 – Lookup post-invite con service key

La verificación de `personal` después del invite usa `serviceKey` para evitar lecturas vacías por RLS.
## Update Marzo 2026 – Reutilización de usuario existente

Antes de crear/invitar un tracker, el sistema busca si ya existe un `auth.users` para ese email.
Si existe, reutiliza ese usuario.
Solo crea/invita un usuario nuevo si no existe uno previo para el email.