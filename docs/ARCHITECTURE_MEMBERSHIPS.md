# Architecture: Memberships y Roles por Organización

## Objetivo
Documentar el modelo operativo real de organizaciones y roles, alineado con los paths de implementación actuales.

## Modelo operativo canónico

Un usuario normal pertenece operativamente a una sola organización propia al crear su cuenta.
El rol tracker solo se adquiere por invitación de una organización específica.
Los roles son por organización, no globales.
Nunca se permite degradación automática de rol dentro de la misma organización.

## Source of truth de activeOrgId

Fuente canónica de sesión:
- `server/auth/_session.js` (`/api/auth/session`) lee membresías activas y `get_current_org_id`.
- Si `get_current_org_id` no está disponible, usa la org por defecto de membresía.

Proyección en frontend:
- `src/context/AuthContext.jsx` expone `activeOrgId` como `currentOrg?.id`.
- La UI de tracking consume `auth.activeOrgId` (ejemplo: `src/pages/TrackerDashboard.jsx`).

Regla práctica:
- No tomar `activeOrgId` desde query params ni estado local de página como fuente principal.
- El estado local solo puede ser auxiliar; la sesión canónica manda.
- En fallback de org por defecto se aplica jerarquía de rol: `owner > admin > tracker`.

## Bootstrap owner (alta inicial)

Path real:
1. `AuthContext` detecta sesión sin contexto completo y llama `POST /api/auth/ensure-context`.
2. `server/auth/_ensure-context.js`:
   - Si ya hay membresía activa, la reutiliza.
   - Si no hay membresía, busca org propia por slug/owner.
   - Si no existe, crea org por `create_organization` y asegura membership `owner`.
   - Marca org por defecto y persiste org actual (`set_current_org`/fallbacks).
3. `AuthContext` refresca sesión (`/api/auth/session`) y publica `activeOrgId`.

Resultado:
- Usuario normal queda operativamente en una sola org propia al bootstrap.

## Invitación tracker: emisión y aceptación

### Emisión de invitación tracker

Path:
- `api/invite-tracker.js` (proxy) -> `supabase/functions/send-tracker-invite-brevo/index.ts`.

Regla de autorización:
- El emisor debe ser `owner` activo en esa `org_id`.
- Si no es owner, responde forbidden.
- La identidad del owner se valida con su JWT (`x-user-jwt`) y no se sustituye por identidad tracker en este flujo.
- El owner puede emitir invitaciones consecutivas; para el mismo `org_id + email` se mantiene cooldown de entrega sin cambiar identidad.

### Aceptación de invitación tracker

Path:
- `api/accept-tracker-invite.js` valida JWT usuario y firma HMAC.
- Reenvía a `supabase/functions/accept-tracker-invite/index.ts`.
- Edge Function valida firma y ejecuta `safeUpsertMembership(..., new_role: "tracker")`.
- Luego enlaza `tracker_org_users` y hace `set_current_org` best-effort.

## Precedencia y regla de no degradación (same-org)

Precedencia efectiva en `safeUpsertMembership` (`supabase/functions/_shared/safeMembership.ts`):
- `owner > admin > tracker`.

Regla:
- Para el mismo par `(org_id, user_id)`, solo se permite mantener o subir rol.
- Nunca bajar rol automáticamente.

Comportamiento explícito:
- Same-org: si ya es `owner` o `admin`, aceptar invitación `tracker` mantiene el rol existente.
- Cross-org: roles son independientes; ser `owner` en org A no impide ser `tracker` en org B.

## Per-org roles (no globales)

- Un usuario puede tener roles distintos en organizaciones distintas.
- Toda autorización operativa se evalúa por membresía en `org_id`.
- No existe un rol global único de negocio para todas las orgs.

## Anti-patterns (prohibidos)

1. `upsert` directo a `memberships` con `role='tracker'`.
2. Sobrescribir rol en same-org durante aceptación de invitación.
3. Exponer selector de organización a usuarios normales de una sola org.

## Notas de implementación

- `src/components/OrgSelector.jsx` no renderiza selector si `canSwitchOrganizations` es falso o hay <=1 org.
- `src/context/AuthContext.jsx` bloquea cambio de org si `canSwitchOrganizations` es falso.
- `src/components/AppHeader.jsx` solo muestra selector cuando hay más de una org disponible.

## Capas de defensa

- Capa runtime (principal): `safeUpsertMembership` y flows proxy/edge.
- Capa DB adicional (segun despliegue): RPC `set_member_role` y `accept_invitation` con logica de no degradación en same-org (`supabase/migrations/20260317000100_*`, `20260317000300_*`).
- Capa DB (preview hardening): trigger `trg_prevent_membership_role_downgrade` en `memberships` bloquea downgrade en misma org (`owner/admin -> tracker`) como defensa en profundidad.

---

## Sin membresía: NO_ORG_CONTEXT y espera de invitación

Desde 2026-05, el endpoint `/api/auth/ensure-context` **ya no crea organización automática** para usuarios autenticados sin ninguna membresía. En vez de bootstrap automático:

- Devuelve HTTP 200 con `{ ok: false, code: "NO_ORG_CONTEXT", data: ... }`.
- El frontend debe mostrar pantalla de espera de invitación (onboarding para testers: cuenta creada, espera invitación o abre el enlace recibido).
- Solo si el usuario ya tiene al menos una membresía, se resuelve contexto normal y se expone la organización activa.

Esto evita crear organizaciones basura y permite flujos de onboarding controlados para testers y usuarios invitados.
