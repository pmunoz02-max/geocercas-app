# Legacy Data Note

Invite acceptance by sha256 hash is working conceptually. However, preview still contains legacy tracker_invites rows with invite_token_hash = null. These invites cannot be accepted by the new architecture and must be reissued through the corrected invite creation flow.
# Frontend Fix Note

After restoring the real accept flow, the frontend had to re-add the Authorization Bearer inviteToken in the POST request to /api/accept-tracker-invite. Omitting this header caused authentication failures even with a valid invite token.
# Deployment Compliance

All changes and debug flows are documented here to ensure traceability and compliance with deployment rules. Any temporary or experimental routing, endpoint, or validation logic must be reflected in this file for audit and rollback purposes.
# Migration Note

Routing and POST were confirmed OK. `/api/accept-tracker-invite` now moves from the route override marker to the real invite-token-hash validation flow, using the opaque bearer token and no JWT parsing.
# Debug Confirmation

Confirmed: /api/accept-tracker-invite returns 200 for both GET and POST requests directly.
Remaining issue is in the TrackerInviteStart UI flow, likely due to form submission or duplicate handler execution, not the backend endpoint.
# Routing Isolation Note

Routing isolation in preview must reuse existing API files only, because Vercel Hobby is capped at 12 functions. Creating new temporary endpoints under /api/ can exceed this limit and break deployment.
# Key Security Note

- The invite token is an opaque string and must never be parsed, decoded, or validated as a JWT.
- The `/api/accept-tracker-invite` endpoint must validate the invite token **only** by computing its SHA-256 hash and matching it against `tracker_invites.invite_token_hash` in the database.
- No user session, JWT verification, or token decoding should be performed for invite acceptance.

# Tracker Invite Runtime Debug

## Change
Forced Node runtime for `/api/accept-tracker-invite` and kept a minimal handler with a debug marker.

## Purpose
Confirm whether the persistent `FUNCTION_INVOCATION_FAILED` comes from runtime resolution before business logic execution.

## Environment
Preview only.
Resolved root cause of FUNCTION_INVOCATION_FAILED: syntax error in api/accept-tracker-invite.js ("Unexpected token :"). Endpoint replaced with valid minimal Node handler for isolation.
