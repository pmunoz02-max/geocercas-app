# RLS POLICIES

## 1. Alcance
Este documento resume el modelo de aislamiento por org y su interaccion con integridad de roles en memberships.

No define SQL exacto por tabla para todos los casos. Donde aplique, se documenta la ruta de implementacion observable.

## 2. Modelo operativo de organizaciones y roles

Un usuario normal pertenece operativamente a una sola organización propia al crear su cuenta.
El rol tracker solo se adquiere por invitación de una organización específica.
Los roles son por organización, no globales.
Nunca se permite degradación automática de rol dentro de la misma organización.

## 3. Boundary de seguridad multi-tenant

- Tenant key principal: `org_id`.
- Scope de acceso: membresias activas del usuario en esa org.
- Contexto activo de org: sesion canónica (`/api/auth/session`) proyectada a `AuthContext.activeOrgId`.

## 4. Roles por org (no global)

- Los permisos se evalúan por fila de membership `(org_id, user_id)`.
- Un usuario puede tener combinaciones validas entre orgs (ejemplo: owner en A, tracker en B).

## 5. Regla same-org de no degradación

Precedencia de roles operativa:
- `owner > admin > tracker`.

En la misma org:
- Al escribir memberships, solo se permite mantener o subir rol.
- Una invitacion de menor rol nunca debe sobreescribir un rol mayor existente.

Implementacion principal:
- `supabase/functions/_shared/safeMembership.ts` (`safeUpsertMembership`).

Capas complementarias (segun despliegue DB):
- `set_member_role` protegido contra downgrade (`supabase/migrations/20260317000100_safe_membership_writes.sql`).
- `accept_invitation` aplica MAX(existing, invite) en same-org (`supabase/migrations/20260317000300_accept_invitation_no_downgrade.sql`).

## 6. Tracker invitations: reglas de seguridad

Emision:
- Solo owner activo de la org puede generar invitacion tracker.
- Path: `api/invite-tracker.js` -> `supabase/functions/send-tracker-invite-brevo/index.ts`.

Aceptacion:
- Requiere proxy firmado (HMAC) y usuario autenticado.
- Path: `api/accept-tracker-invite.js` -> `supabase/functions/accept-tracker-invite/index.ts` -> `safeUpsertMembership`.

## 7. Same-org vs cross-org (comportamiento esperado)

Same-org:
- Si usuario ya es `owner/admin`, aceptar tracker invite mantiene rol mayor.

Cross-org:
- Invitacion en otra org crea/actualiza membership solo en esa org.
- No hay propagacion de rol entre orgs.

## 8. Anti-patrones prohibidos

1. `upsert` directo de `memberships` con `role='tracker'`.
2. Sobrescritura de rol same-org al aceptar invitacion.
3. Exponer selector de org a usuarios normales de una sola org.

## 9. Checklist rapido de validacion

1. Toda query operativa filtra por `org_id`.
2. Toda escritura de memberships pasa por path seguro (safeUpsertMembership o RPC segura).
3. Se distingue explicitamente comportamiento same-org vs cross-org.
4. `activeOrgId` viene de sesion canónica y no de estado local ad-hoc.
