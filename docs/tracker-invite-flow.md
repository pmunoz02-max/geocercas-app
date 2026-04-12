# Canonical Tracker Invite Flow (Preview)

## Resumen

- El usuario invita a un tracker desde el panel.
- El tracker acepta la invitación (por email, app, etc).
- El backend crea una sesión en `tracker_runtime_sessions`:
  - Genera un `tracker_access_token` (opaco o JWT).
  - Guarda solo el hash del token, junto con `org_id`, `tracker_user_id`, `expires_at`, `active=true`.
- El cliente (Android/WebView) almacena el `tracker_access_token` y lo usa para autenticarse.
- Cada vez que el tracker reporta posición:
  - Envía POST a `/api/send-position` con `Authorization: Bearer <tracker_access_token>` y el payload de posición.
  - El backend valida el hash del token contra `tracker_runtime_sessions`.
  - Si es válido y tiene asignación activa, persiste la posición en `positions` y actualiza el estado en `tracker_latest`.
- El dashboard y los sistemas realtime consumen los datos de `tracker_latest`.

## Reglas clave

- **Prohibido depender de owner session o sesión web para el tracking runtime.**
- **Prohibido usar magic link como flujo canónico para trackers.**
- El único flujo canónico es: invite → runtime session → tracker_access_token → envío directo a `/api/send-position`.

---

## Preview Invite Acceptance (Technical Note)

In preview, the real invite acceptance flow works as follows:

- The invite token received from the user (inviteTokenPlain) is hashed with SHA-256:
  - `sha256Hex(inviteTokenPlain)`
- The hash is looked up in the database:
  - `tracker_invites.invite_token_hash`
- If a match is found, the backend calls:
  - `get_tracker_invite_claim(invite.id)`
- If the claim is valid, the invite row is updated:
  - `accepted_at`, `used_at`, `used_by_user_id`, `is_active`

This ensures that only the holder of the original invite token can accept the invitation, and the token is never stored in plaintext.

---

Última actualización: 2026-04-11

# Tracker Invite Flow (2026)

## Overview
This document describes the tracker invite flow as of April 2026, focusing on the use of invite tokens and the backend logic using a service role Supabase client to accept invitations securely.

## Flow Summary
1. **Invite Link Generation**
   - The backend generates an invite link containing a unique invite token (UUID) and, optionally, an org_id.
   - Example: `https://app.tugeocercas.com/tracker-accept?inviteToken=<uuid>&org_id=<org_id>`

2. **User Opens Invite Link**
   - The user opens the invite link on their device (typically Android, via TWA or browser).
   - The app loads the `/tracker-accept` consent page, which displays information and requests user consent for background location tracking.

3. **Consent and Accept Invite**
   - The user must explicitly consent to background location tracking.
   - On consent, the frontend sends a POST request to `/api/accept-tracker-invite` with the invite token in the `Authorization: Bearer <inviteToken>` header and the org_id in the body.

4. **API Handler: Token Validation and Acceptance**
   - The API handler extracts the invite token from the Authorization header.
   - It validates that the token is a valid UUID.
   - It uses a Supabase admin (service role) client to call the `accept_invitation` RPC:
     ```js
     const { data, error } = await sbAdmin.rpc('accept_invitation', {
       p_token: inviteToken,
     });
     ```
   - If the RPC succeeds, the invitation is accepted and the user is provisioned in the correct org.
   - If the RPC fails, an error is returned to the frontend.

5. **Session Bootstrap**
   - After successful acceptance, the frontend redirects to `/tracker-gps` with the invite token and org_id as query parameters.
   - The runtime session is only persisted after the backend confirms invite acceptance.

## Security Notes
- The invite token is a UUID and must be validated as such.
- The backend uses the Supabase service role key to ensure only server-side code can accept invitations.
- No user session is created or persisted until the invite is accepted.
- The invite token is never stored on the device before consent and acceptance.

## Example API Call
```http
POST /api/accept-tracker-invite
Authorization: Bearer <inviteToken>
Content-Type: application/json

{
  "org_id": "<org_id>"
}
```

## Example Handler Logic
```js
const inviteToken = getBearerToken(req);
if (!inviteToken) { /* ... */ }
if (!uuidRegex.test(inviteToken)) { /* ... */ }
const { data, error } = await sbAdmin.rpc('accept_invitation', { p_token: inviteToken });
```

## Key Points
- No session is persisted before explicit consent and invite acceptance.
- Only the service role client can call the RPC to accept the invite.
- The flow is robust against replay and duplicate processing.