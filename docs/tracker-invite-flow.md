# Canonical Tracker Invite Flow (Preview)
# Canonical Tracker Invite Flow (Preview)

## Resumen

- El usuario invita a un tracker desde el panel.
- El tracker abre el link de invitación en Android.
- La app muestra `/tracker-accept` para consentimiento.
- Al aceptar, el frontend llama `POST /api/accept-tracker-invite` con:
  - `Authorization: Bearer <inviteTokenPlain>`
  - `org_id` en el body
- El backend **no** valida ese token como sesión Auth de usuario.
- El backend calcula:
  - `sha256Hex(inviteTokenPlain)`
- Luego busca la invitación en:
  - `public.tracker_invites.invite_token_hash`
- Si encuentra una invitación activa/no usada/no expirada:
  - llama `get_tracker_invite_claim(invite.id)`
  - resuelve `tracker_user_id`
  - actualiza la fila:
    - `accepted_at`
    - `used_at`
    - `used_by_user_id` si existe
    - `is_active = false`
- Si todo sale bien, el frontend navega a:
  - `/tracker-gps?t=<inviteTokenPlain>&org_id=<org_id>`
- Android bootstrapea el runtime tracker y comienza el tracking.

## Reglas clave

- **Prohibido depender de owner session o sesión web para el tracking runtime.**
- **Prohibido usar `supabase.auth.getUser()` para aceptar tracker invites.**
- **Prohibido asumir que el invite token es UUID.**
- El invite token real llega en texto plano por URL y se valida por hash SHA-256.
- El consentimiento web no debe persistir sesión tracker antes de la aceptación.
- El bootstrap Android ocurre solo en `/tracker-gps`.

## Preview Invite Acceptance (Technical Note)

En preview, la aceptación real del tracker invite funciona así:

1. El email contiene un token plano:
   - `inviteTokenPlain`
2. En base de datos no se guarda el token plano.
3. Se guarda solo:
   - `tracker_invites.invite_token_hash`
4. El backend calcula:
   - `sha256Hex(inviteTokenPlain)`
5. Busca coincidencia en:
   - `public.tracker_invites`
6. Si encuentra una invitación válida:
   - usa `get_tracker_invite_claim(invite.id)`
   - marca la invitación como aceptada/usada

Esto asegura que solo quien recibió el token real pueda aceptar la invitación.

## Backend Debug Instrumentation

El endpoint `/api/accept-tracker-invite` debe:

- leer `Authorization: Bearer <inviteTokenPlain>`
- calcular hash SHA-256 del token
- buscar `invite_token_hash`
- validar:
  - `is_active = true`
  - `used_at is null`
  - `accepted_at is null`
  - `expires_at > now()`
- llamar `get_tracker_invite_claim(invite.id)`
- actualizar la fila de `tracker_invites`
- devolver respuesta estructurada

## Cosas que NO aplican en preview actual

Estas rutas/lógicas no son la base real de aceptación en preview:

- `accept_invitation(...)`
- `rpc_accept_invite(...)`
- `claim_pending_invite(...)`

Razón:
- en preview actual están ausentes o en modo stub/no-op para este flujo.

## Flujo canónico buscado

email → app → consentimiento → accept-tracker-invite → tracker-gps → runtime tracker → send-position → tracker_latest/dashboard

## Debug (Abril 2026)

- Se eliminó la dependencia de `INVALID_USER_JWT` para tracker invite.
- Se confirmó que el invite token no debe validarse como JWT de usuario.
- Se aisló el endpoint `/api/accept-tracker-invite` para depurar errores 500.
- Se confirmó que cualquier cambio de backend/arquitectura debe ir acompañado de actualización en `docs/`.

Última actualización: 2026-04-12

---

## Actualización de flujo y contrato de endpoints (Abril 2026)

- El endpoint `/api/invite-tracker` ahora retorna el status y body reales del edge function (`send-tracker-invite-brevo`) en caso de error (por ejemplo, errores de validación, fallos de base de datos, etc). Esto permite depuración y diagnóstico directo desde el frontend o sistemas integradores.
- En caso de éxito, `/api/invite-tracker` responde con el body ya parseado del edge function.
- El edge function `send-tracker-invite-brevo` **siempre** retorna los campos `invite_id`, `created_at` y `invite_url` obtenidos de la fila real insertada/actualizada en la tabla `tracker_invites`. Si falta alguno de estos campos, responde con error 500 y detalle explícito.
- El frontend y cualquier consumidor deben usar únicamente el `invite_url` y metadatos retornados por la respuesta más reciente de la función.

**Ejemplo de error propagado:**
```json
{
  "ok": false,
  "error": "invite_upstream_failed",
  "upstream_status": 500,
  "upstream_body": { "error": "invite_row_missing_after_insert" }
}
```

**Ejemplo de respuesta exitosa:**
```json
{
  "ok": true,
  "invite_id": "...",
  "invite_created_at": "2026-04-13T12:34:56.789Z",
  "inviteUrl": "https://.../tracker-accept?..."
  // ...otros campos...
}
```