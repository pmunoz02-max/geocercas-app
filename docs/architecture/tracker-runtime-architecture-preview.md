> ⚠️ SUPERSEDED / HISTÓRICO
>
> Este documento queda como referencia histórica.  
> La fuente viva actual del flujo invite/tracker es:
>
> docs/skills/invite-tracker.md
>
> Regla vigente: signaciones = fuente operativa/UI, 	racker_assignments = espejo runtime Android, 	racker_positions = fuente canónica de posiciones dashboard.

---
# Tracker Runtime Architecture (Preview)


## Overview
This document describes the canonical architecture for tracker runtime authentication and position reporting in the preview version of the Geocercas platform. **All tracker actions use a dedicated runtime token (`tracker_access_token`) for authentication, not user credentials or web sessions.** The flow is stateless, secure, and fully decoupled from any owner or web authentication.

---

## 1. Invite Acceptance & Runtime Session Creation
- When a tracker accepts an invite (via email link or similar), the backend:
  - Resolves the `tracker_user_id` and `org_id`.
  - Generates a new **tracker runtime token opaco** (no es un JWT).
  - Hashes the token and upserts a new row in `public.tracker_runtime_sessions`:
    - `org_id`, `tracker_user_id`, `access_token_hash`, `active=true`, `expires_at`, `source`.
  - Invalidates any previous active sessions for the same tracker/org.
  - Returns the plain `tracker_access_token` to the client (Android/WebView).

---


## 2. Tracker Client (Android/WebView)
- Stores the **tracker runtime token opaco** and `org_id` locally (e.g., localStorage o almacenamiento seguro).
- Para cada actualizaciÃ³n de posiciÃ³n, envÃ­a un POST a `/api/send-position` con:
  - `Authorization: Bearer <tracker runtime token opaco>`
  - Cuerpo JSON: `{ org_id, lat, lng, ... }`
- **El tracker nunca usa autenticaciÃ³n de usuario, sesiÃ³n web ni magic link. Solo el token runtime es necesario para autenticar y enviar posiciones.**

---

## 3. Position Endpoint: `/api/send-position`
- Receives the request and extracts the Bearer token.
- Hashes the token and looks up an active session in `tracker_runtime_sessions` for the given `org_id`.
- If valid, resolves `tracker_user_id` and validates an active assignment in `tracker_assignments`.
- Writes the canonical position to `positions` and upserts the latest state in `tracker_latest`.
- Updates `last_seen_at` in `tracker_runtime_sessions`.
- Rejects if the token is invalid, expired, or not assigned.

---

## 4. Security & Statelessness
- The runtime flow is **stateless**: no cookies, no web session, no owner login required.
- All authentication is via the Bearer **tracker runtime token opaco**.
- Tokens are never stored in plain form in the database; only their hash is persisted.
- Sessions can be revoked by marking `active=false` in `tracker_runtime_sessions`.

---

## 5. Summary Diagram

```mermaid
graph TD
  A[Invite Accepted] --> B[Create tracker runtime token opaco]
  B --> C[Upsert tracker_runtime_sessions]
  C --> D[Return token to client]
  D --> E[Android/WebView stores token]
  E --> F[Send position with Bearer token]
  F --> G[/api/send-position validates token]
  G --> H[Write to positions & tracker_latest]
```

---


## 6. Key Properties
- **No user authentication or web session required** for runtime tracking. Only the runtime token is used.
- **Single source of truth**: all runtime validation is via `tracker_runtime_sessions`.
- **Easy revocation**: set `active=false` to revoke a token.
- **No exposure of user credentials**: only the tracker token is used for runtime auth.

---

## 7. Future Considerations
- Support for token rotation and refresh.
- Optional device fingerprinting for additional security.
- Audit logging for session creation and revocation.

---

_Last updated: 2026-04-11_

