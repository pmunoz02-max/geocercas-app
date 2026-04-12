# Tracker Invite Runtime Debug

## Change
Forced Node runtime for `/api/accept-tracker-invite` and kept a minimal handler with a debug marker.

## Purpose
Confirm whether the persistent `FUNCTION_INVOCATION_FAILED` comes from runtime resolution before business logic execution.

## Environment
Preview only.
Resolved root cause of FUNCTION_INVOCATION_FAILED: syntax error in api/accept-tracker-invite.js ("Unexpected token :"). Endpoint replaced with valid minimal Node handler for isolation.
Agrega una nota corta diciendo que se añadió un debug temporal para inspeccionar si el header Authorization llega al endpoint.