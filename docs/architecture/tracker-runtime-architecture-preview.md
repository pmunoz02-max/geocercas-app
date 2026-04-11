# Tracker Runtime Architecture (Preview)

## Overview
This document describes the canonical architecture for tracker runtime authentication and position reporting in the preview version of the Geocercas platform. The flow is designed to be stateless, secure, and independent of any web or owner session.

---

## 1. Invite Acceptance & Runtime Session Creation
- When a tracker accepts an invite (via email link or similar), the backend:
  - Resolves the `tracker_user_id` and `org_id`.
  - Generates a new `tracker_access_token` (opaque or JWT).
  - Hashes the token and upserts a new row in `public.tracker_runtime_sessions`:
    - `org_id`, `tracker_user_id`, `access_token_hash`, `active=true`, `expires_at`, `source`.
  - Invalidates any previous active sessions for the same tracker/org.
  - Returns the plain `tracker_access_token` to the client (Android/WebView).

---

## 2. Tracker Client (Android/WebView)
- Stores the `tracker_access_token` and `org_id` locally (e.g., localStorage or secure storage).
- For every position update, sends a POST to `/api/send-position` with:
  - `Authorization: Bearer <tracker_access_token>`
  - JSON body: `{ org_id, lat, lng, ... }`
- **No dependency on owner session or Supabase web session.**

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
- All authentication is via the Bearer `tracker_access_token`.
- Tokens are never stored in plain form in the database; only their hash is persisted.
- Sessions can be revoked by marking `active=false` in `tracker_runtime_sessions`.

---

## 5. Summary Diagram

```mermaid
graph TD
  A[Invite Accepted] --> B[Create tracker_access_token]
  B --> C[Upsert tracker_runtime_sessions]
  C --> D[Return token to client]
  D --> E[Android/WebView stores token]
  E --> F[Send position with Bearer token]
  F --> G[/api/send-position validates token]
  G --> H[Write to positions & tracker_latest]
```

---

## 6. Key Properties
- **No web session required** for runtime tracking.
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
