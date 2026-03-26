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

## Enforcement de Planes y Límites (Preview)

### Fuente de verdad de límites
- La vista `org_entitlements` es la única fuente de verdad para límites efectivos por organización.
- Nunca se debe usar directamente `org_billing` para enforcement de límites.

### Fallback backend
- Si una Edge Function o flujo backend no puede consultar la vista `org_entitlements`, debe usar la función SQL `resolve_effective_plan_code` y complementar con los datos de `org_billing`.

### Separación de responsabilidades
- `org_billing` almacena el estado comercial de la suscripción (plan_code, subscribed_plan_code, plan_status, billing_provider, customer_id, subscription_id).
- `org_entitlements` expone los límites efectivos y capacidades del sistema.

### Regla de consistencia
- Si existe discrepancia entre `org_billing` y `org_entitlements`, el enforcement SIEMPRE usa `org_entitlements`.

### Backend enforcement obligatorio
- Toda operación limitada (creación de trackers, geocercas, features premium) debe validar límites en backend antes de ejecutar.

### Frontend
- Solo refleja límites y estado; nunca es barrera de seguridad.

### Logging obligatorio
- En cada denegación por límite se debe registrar: org_id, plan_code, operation, limit, current_count, reason.

### Contexto Paddle
- Paddle activa y actualiza `org_billing` vía webhook.
- El enforcement operativo depende exclusivamente de `org_entitlements`.
- Esta separación desacopla la facturación de las capacidades del sistema.

### Ejemplo concreto: creación de trackers

1. Obtener el plan y límites efectivos desde `org_entitlements` para el `org_id` correspondiente.
2. Contar la cantidad actual de trackers activos para la organización.
3. Comparar con el límite `max_trackers`.
4. Si el límite se excede, rechazar la operación y registrar el evento de acuerdo a la política de logging.
5. Si no se excede, permitir la creación del tracker.

---

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
