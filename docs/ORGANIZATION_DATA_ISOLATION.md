# ORGANIZATION DATA ISOLATION

## Objetivo
Definir el aislamiento multi-tenant por `org_id` y su relacion con memberships/roles en los flujos reales.

## Modelo operativo de organizaciones y roles

Un usuario normal pertenece operativamente a una sola organización propia al crear su cuenta.
El rol tracker solo se adquiere por invitación de una organización específica.
Los roles son por organización, no globales.
Nunca se permite degradación automática de rol dentro de la misma organización.

## Tenant boundary

Clave de aislamiento:
- `org_id` en tablas operativas.

Control de acceso:
- Membresías activas por `(org_id, user_id)`.
- Roles evaluados por org, no globalmente.

## Source of truth de organizacion activa

- Backend: `/api/auth/session` devuelve `current_org_id` desde contexto persistido (`get_current_org_id`) o fallback por default membership.
- Frontend: `AuthContext` proyecta `activeOrgId = currentOrg.id`.

Principio:
- Queries y mutaciones deben ejecutarse con el `org_id` de sesión activa.

## Bootstrap owner y aislamiento inicial

`/api/auth/ensure-context` garantiza que un usuario sin membresía quede con:
- org propia resuelta/creada,
- membership `owner`,
- org activa persistida.

Esto evita usuarios autenticados sin tenant operativo.

## Tracker invite y aislamiento

Emisión:
- Solo owner activo de una org puede invitar tracker para esa org.

Aceptación:
- `accept-tracker-invite` escribe membresía canónica con `safeUpsertMembership` y enlaza `tracker_org_users`.

Efecto de aislamiento:
- Same-org: mantiene rol mayor existente (sin degradar).
- Cross-org: crea/actualiza membresía solo en org invitante.

## Comportamiento same-org vs cross-org

Same-org:
- `owner/admin` no se degradan a `tracker` por aceptar invitación.

Cross-org:
- Roles independientes por fila `(org_id, user_id)`.
- Ser `owner` en org A no concede ni bloquea rol en org B.

## Selector de organización

Regla UX alineada al modelo:
- No exponer selector de org a usuario normal con una sola org operativa.

Implementación observada:
- `OrgSelector` no renderiza selector si no hay capacidad de cambio o hay <=1 org.
- `AuthContext.selectOrg` bloquea cambios cuando `canSwitchOrganizations` es falso.

## Anti-patrones prohibidos

1. `upsert` directo a `memberships` con `role='tracker'`.
2. Sobrescribir rol en same-org al aceptar invitación.
3. Exponer selector de org a usuarios normales de una sola org.

## Nota de arquitectura

RLS y filtros por `org_id` son obligatorios, pero la integridad de rol same-org se protege ademas en el path de escritura de memberships (`safeUpsertMembership` y RPCs de membresías, segun despliegue).

## Sin membresía: NO_ORG_CONTEXT y espera de invitación

Desde 2026-05, el endpoint `/api/auth/ensure-context` **ya no crea organización automática** para usuarios autenticados sin ninguna membresía. En vez de bootstrap automático:

- Devuelve HTTP 200 con `{ ok: false, code: "NO_ORG_CONTEXT", data: ... }`.
- El frontend debe mostrar pantalla de espera de invitación (onboarding para testers: cuenta creada, espera invitación o abre el enlace recibido).
- Solo si el usuario ya tiene al menos una membresía, se resuelve contexto normal y se expone la organización activa.

Esto evita crear organizaciones basura y permite flujos de onboarding controlados para testers y usuarios invitados.
