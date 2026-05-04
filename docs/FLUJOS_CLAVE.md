# Flujos Clave del Sistema

## Modelo operativo de organizaciones y roles

Un usuario normal pertenece operativamente a una sola organización propia al crear su cuenta.
El rol tracker solo se adquiere por invitación de una organización específica.
Los roles son por organización, no globales.
Nunca se permite degradación automática de rol dentro de la misma organización.

## Flujo 1: Bootstrap owner (usuario nuevo)

```text
Login exitoso
  -> GET /api/auth/session
  -> Si falta contexto: POST /api/auth/ensure-context
  -> ensure-context crea/recupera org propia y membership owner
  -> set_current_org + membresía por defecto
  -> GET /api/auth/session (refresh)
  -> AuthContext publica activeOrgId
```

Implementación:
- `server/auth/_session.js`
- `server/auth/_ensure-context.js`
- `src/context/AuthContext.jsx`

## Flujo 2: Invitación tracker (owner de org)

```text
UI owner -> POST /api/invite-tracker
  -> Proxy firma request
  -> Edge send-tracker-invite-brevo
  -> valida caller con JWT y membership owner activa en org
  -> crea/actualiza tracker_invites + magic link
```

Implementación:
- `api/invite-tracker.js`
- `supabase/functions/send-tracker-invite-brevo/index.ts`

Regla:
- Solo owner de esa org puede invitar tracker.
- Invitar tracker no cambia la identidad del owner (la autorización se mantiene con JWT del owner).
- El owner puede ejecutar invitaciones consecutivas; en mismo `org_id + email` el envío aplica cooldown de entrega.

## Flujo 3: Aceptación de invitación tracker

```text
Tracker autenticado -> POST /api/accept-tracker-invite
  -> Proxy valida JWT usuario y firma HMAC
  -> Edge accept-tracker-invite valida HMAC
  -> safeUpsertMembership(org_id, user_id, new_role='tracker')
  -> upsert tracker_org_users
  -> set_current_org (best-effort)
```

Implementación:
- `api/accept-tracker-invite.js`
- `supabase/functions/accept-tracker-invite/index.ts`
- `supabase/functions/_shared/safeMembership.ts`

## Flujo 4: Resolución de activeOrgId

```text
/api/auth/session
  -> memberships activas del usuario
  -> get_current_org_id (si existe)
  -> fallback a org por defecto (jerarquía owner > admin > tracker)
  -> AuthContext.currentOrg
  -> activeOrgId = currentOrg.id
```

Source of truth:
- `activeOrgId` operativo se toma de `AuthContext` alimentado por `/api/auth/session`.
- La sesión base del dashboard/app se hidrata desde el singleton `src/lib/supabaseClient.js` con `auth.getSession()` y `auth.onAuthStateChange()`.
- `AuthContext` expone `session`, `user`, `loading`, `initialized` y solo resuelve contexto de org después de confirmar la sesión del cliente.
- `AuthGuard` y `RequireOrg` redirigen a `/login` solo cuando `initialized === true` y no existe `user`.
- `Login.tsx`, `AuthContext.jsx`, `AuthGuard.jsx`, `RequireOrg.jsx`, `/tracker` y `/dashboard` deben usar la misma instancia singleton de Supabase.
- El flujo público `tracker-gps` mantiene su cliente dedicado, pero sin `storageKey` manual para evitar divergencias entre preview y production.

## Sin membresía: NO_ORG_CONTEXT y espera de invitación

Desde 2026-05, el endpoint `/api/auth/ensure-context` **ya no crea organización automática** para usuarios autenticados sin ninguna membresía. En vez de bootstrap automático:

- Devuelve HTTP 200 con `{ ok: false, code: "NO_ORG_CONTEXT", data: ... }`.
- El frontend debe mostrar pantalla de espera de invitación (onboarding para testers: cuenta creada, espera invitación o abre el enlace recibido).
- Solo si el usuario ya tiene al menos una membresía, se resuelve contexto normal y se expone la organización activa.

Esto evita crear organizaciones basura y permite flujos de onboarding controlados para testers y usuarios invitados.

## Misma org vs org distinta

Same-org (`org_id` igual):
- Se aplica precedencia `owner > admin > tracker`.
- No se permite downgrade automatico; se mantiene el rol mayor.
- Trigger DB `trg_prevent_membership_role_downgrade` bloquea downgrade en la misma org como capa adicional.

Cross-org (`org_id` distinto):
- Los memberships son independientes.
- Un usuario puede ser `owner` en org A y `tracker` en org B sin conflicto.

## Anti-patrones

1. Upsert directo a `memberships` con `role='tracker'`.
2. Overwrite de rol en same-org al aceptar invitación.
3. Mostrar selector de org a usuario normal de una sola org.
4. Usar cliente principal para callbacks/páginas tracker (`AuthCallback` y `TrackerGpsPage` deben usar cliente tracker en flujo tracker).
5. Mezclar para `/tracker` o `/dashboard` varias fuentes de auth a la vez (`/api/auth/session`, bypasses manuales y otro cliente Supabase distinto).
6. Forzar `storageKey='sb-tracker-auth'` cuando el SDK persiste la sesión bajo su clave canónica del proyecto.
