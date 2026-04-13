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

## Environment...
Preview only.
Resolved root cause of FUNCTION_INVOCATION_FAILED: syntax error in api/accept-tracker-invite.js ("Unexpected token :"). Endpoint replaced with valid minimal Node handler for isolation.
